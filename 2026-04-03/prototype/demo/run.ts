/* eslint-disable import/max-dependencies, no-console, no-magic-numbers, sort-imports, no-negated-condition, typescript/no-unsafe-type-assertion, typescript/no-unsafe-call, typescript/no-unsafe-assignment -- デモ用CLIエントリポイント */
/**
 * ReconcileBot デモエントリポイント
 *
 * 3層アーキテクチャ（ハーネス/AIエージェント/決定論的コード）が
 * 連携して入金消込を実行するデモ。
 */

/* eslint-disable import/no-nodejs-modules -- CLIデモのためNode.js標準モジュールが必要 */
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
/* eslint-enable import/no-nodejs-modules */

import type { BankDeposit, MatchResult, Receivable } from "../types.ts";
import { fuzzyMatch } from "../agent/index.ts";
import { exactAmountMatch, feeAdjustedMatch } from "../deterministic/rules.ts";
import { generateQualityReport } from "../harness/checker.ts";
import { afterMatch, beforeFinalize, beforeMatch } from "../harness/lifecycle.ts";
import { formatChecklist, isComplete } from "../harness/planner.ts";
import { generateImprovementProposals } from "../knowledge/improver.ts";
import { loadKnowledge, recordMapping, saveKnowledge } from "../knowledge/store.ts";

// eslint-disable-next-line typescript/no-unsafe-call, typescript/no-unsafe-assignment, typescript/no-unsafe-type-assertion -- Node.js path
const currentDir: string = dirname(fileURLToPath(import.meta.url)) as string;

const SEPARATOR = "=".repeat(60); // eslint-disable-line no-magic-numbers -- 表示幅
const SUB_SEPARATOR = "-".repeat(40); // eslint-disable-line no-magic-numbers -- 表示幅
const PERCENT = 100;

/** JSONファイルを読み込む */
// eslint-disable-next-line typescript/no-unsafe-call, typescript/no-unsafe-assignment, typescript/no-unsafe-type-assertion -- Node.js fs
const loadJson = <TData>(filename: string): TData =>
  JSON.parse(readFileSync(resolve(currentDir, `../data/${filename}`), "utf8") as string) as TData;

/** 1カテゴリ分の結果を表示する */
const printCategory = (label: string, prefix: string, items: MatchResult[]): void => {
  console.log(`\n${label} ${items.length}件`);
  for (const res of items) {
    if (res.category === "candidate") {
      const pct = res.confidence === null ? "N/A" : `${(res.confidence * PERCENT).toFixed(0)}%`;
      console.log(`  ${prefix} ${res.reason} [信頼度: ${pct}]`);
    } else if (res.category === "investigation_required") {
      console.log(
        `  ${prefix} 入金ID: ${res.deposit.id} / ¥${res.deposit.amount.toLocaleString()} / 名義: ${res.deposit.payerName}`,
      );
    } else {
      console.log(`  ${prefix} ${res.reason}`);
    }
  }
};

/** カテゴリ別にマッチング結果を表示する */
const printResults = (results: MatchResult[]): void => {
  console.log(`\n${SUB_SEPARATOR}`);
  printCategory(
    "[自動確定]",
    "✓",
    results.filter((res) => res.category === "auto_confirmed"),
  );
  printCategory(
    "[候補（要承認）]",
    "?",
    results.filter((res) => res.category === "candidate"),
  );
  printCategory(
    "[要調査]",
    "!",
    results.filter((res) => res.category === "investigation_required"),
  );
};

/** Step 1: 入力データ検証 */
const runStep1 = (deposits: BankDeposit[], receivables: Receivable[]): void => {
  console.log(`\n${SEPARATOR}`);
  console.log("Step 1: beforeMatch — 入力データ検証");
  const preCheck = beforeMatch(deposits, receivables);
  console.log(
    preCheck.passed ? "  ✓ 入力データ検証: OK" : `  ✗ 問題検出: ${preCheck.issues.join(", ")}`,
  );
};

/** 未マッチ入金を「要調査」に変換する */
const toInvestigationResults = (remaining: BankDeposit[]): MatchResult[] =>
  remaining.map((dep) => ({
    category: "investigation_required" as const,
    confidence: null,
    deposit: dep,
    matchMethod: "none" as const,
    reason: "マッチング候補なし",
    receivable: null,
  }));

interface StepResult {
  matched: MatchResult[];
  unmatchedDeposits: BankDeposit[];
  unmatchedReceivables: Receivable[];
}

/** Step 2: 決定論的マッチング */
const runStep2 = (deposits: BankDeposit[], receivables: Receivable[]): StepResult => {
  console.log(`\n${SEPARATOR}`);
  console.log("Step 2: 決定論的マッチング（AIを使わない確実な処理）");
  const exact = exactAmountMatch(deposits, receivables);
  console.log(`  [完全一致] ${exact.matched.length}件 / 残り${exact.unmatchedDeposits.length}件`);
  const feeAdj = feeAdjustedMatch(exact.unmatchedDeposits, exact.unmatchedReceivables);
  console.log(
    `  [手数料差額] ${feeAdj.matched.length}件 / 残り${feeAdj.unmatchedDeposits.length}件`,
  );
  return {
    matched: [...exact.matched, ...feeAdj.matched],
    unmatchedDeposits: feeAdj.unmatchedDeposits,
    unmatchedReceivables: feeAdj.unmatchedReceivables,
  };
};

/** Step 3: AI曖昧マッチング */
const runStep3 = (prev: StepResult): MatchResult[] => {
  console.log(`\n${SEPARATOR}`);
  console.log("Step 3: AIエージェント曖昧マッチング（ナレッジ辞書 + ヒューリスティック）");
  const knowledge = loadKnowledge();
  const aiResult = fuzzyMatch(prev.unmatchedDeposits, prev.unmatchedReceivables, knowledge);
  console.log(`  [AI曖昧] ${aiResult.matched.length}件 / 残り${aiResult.remaining.length}件`);
  return [...prev.matched, ...aiResult.matched, ...toInvestigationResults(aiResult.remaining)];
};

/** Step 4-5: ハーネス検証を実行する */
const runHarnessValidation = (allResults: MatchResult[], deposits: BankDeposit[]): void => {
  console.log(`\n${SEPARATOR}`);
  console.log("Step 4: afterMatch — マッチング結果の整合性検証");
  const postCheck = afterMatch(allResults);
  console.log(
    postCheck.passed ? "  ✓ 整合性検証: OK" : `  ✗ 問題検出: ${postCheck.issues.join(", ")}`,
  );

  console.log(`\n${SEPARATOR}`);
  console.log("Step 5: beforeFinalize — 終了条件チェック（ドリフト対策）");
  const { checklist } = beforeFinalize(allResults, deposits);
  console.log(formatChecklist(checklist));
};

/** 品質レポートを表示する */
const printQualityReport = (allResults: MatchResult[]): void => {
  console.log(`\n${SEPARATOR}`);
  console.log("品質レポート（ハーネスによる客観的集計）");
  const quality = generateQualityReport(allResults);
  console.log(`  消込率: ${(quality.autoConfirmRate * PERCENT).toFixed(0)}%`);
  console.log(`  候補平均信頼度: ${(quality.averageCandidateConfidence * PERCENT).toFixed(0)}%`);
  console.log(`  要調査件数: ${quality.investigationCount}件`);
  for (const warning of quality.warnings) {
    console.log(`  ⚠ ${warning}`);
  }
};

/** ナレッジ改善提案を表示する */
const printImprovementProposals = (): void => {
  console.log(`\n${SEPARATOR}`);
  console.log("ナレッジ自動改善提案（ヒューマン・イン・ザ・ループ）");
  const knowledge = loadKnowledge();
  const proposals = generateImprovementProposals(knowledge);
  if (proposals.length === 0) {
    // eslint-disable-line no-magic-numbers -- 空チェック
    console.log("  （昇格提案なし）");
  }
  for (const prop of proposals) {
    console.log(`  📋 ${prop.reason}`);
  }
};

/** ナレッジ蓄積（承認済みマッチングから学習） */
const updateKnowledge = (allResults: MatchResult[]): void => {
  console.log(`\n${SEPARATOR}`);
  console.log("ナレッジ蓄積（承認済みマッチングから学習）");
  let knowledge = loadKnowledge();
  const aiMatched = allResults.filter(
    (res) => res.matchMethod === "ai_fuzzy" && res.receivable !== null,
  );
  for (const res of aiMatched) {
    if (res.receivable) {
      knowledge = recordMapping(
        {
          clientCode: res.receivable.clientCode,
          clientName: res.receivable.clientName,
          payerName: res.deposit.payerName,
        },
        knowledge,
      );
      console.log(`  + 「${res.deposit.payerName}」→「${res.receivable.clientName}」を辞書に記録`);
    }
  }
  saveKnowledge(knowledge);
  console.log("  ✓ ナレッジ辞書を更新しました（data/knowledge.json）");
};

/** データ読み込みとヘッダー表示 */
const initPipeline = (): { deposits: BankDeposit[]; receivables: Receivable[] } => {
  console.log(SEPARATOR);
  console.log("  ReconcileBot — 入金消込自動マッチング プロトタイプ");
  console.log(SEPARATOR);
  const deposits = loadJson<BankDeposit[]>("deposits.json");
  const receivables = loadJson<Receivable[]>("receivables.json");
  console.log(
    `\n入金データ: ${deposits.length}件 / 売掛金: ${receivables.length}件 / 辞書: ${loadKnowledge().length}件`,
  );
  return { deposits, receivables };
};

/** 最終結果を表示する */
const printFinalSummary = (allResults: MatchResult[], deposits: BankDeposit[]): void => {
  const { checklist } = beforeFinalize(allResults, deposits);
  console.log(`\n${SEPARATOR}`);
  const msg = isComplete(checklist)
    ? "✓ 全終了条件を充足。消込処理を完了できます。"
    : "✗ 終了条件が未充足です。人間の確認が必要です。";
  console.log(msg);
  const auto = allResults.filter((res) => res.category === "auto_confirmed").length;
  const cand = allResults.filter((res) => res.category === "candidate").length;
  const inv = allResults.filter((res) => res.category === "investigation_required").length;
  console.log(`\n最終集計: 自動確定${auto} / 候補${cand} / 要調査${inv} (全${deposits.length}件)`);
  console.log(SEPARATOR);
};

/** レポート出力をまとめて実行する */
const runReports = (allResults: MatchResult[]): void => {
  console.log(`\n${SEPARATOR}`);
  console.log("マッチング結果サマリー");
  printResults(allResults);
  printQualityReport(allResults);
  printImprovementProposals();
  updateKnowledge(allResults);
};

/** メインパイプライン */
const main = (): void => {
  const { deposits, receivables } = initPipeline();
  runStep1(deposits, receivables);
  const allResults = runStep3(runStep2(deposits, receivables));
  runHarnessValidation(allResults, deposits);
  runReports(allResults);
  printFinalSummary(allResults, deposits);
};

main();
