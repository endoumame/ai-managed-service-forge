/* eslint-disable no-console, sort-imports -- デモ用CLIエントリポイント */
/**
 * InvoiceForge デモ実行エントリポイント
 *
 * ハーネス → AIエージェント → 決定論的コード → ナレッジ改善の
 * パイプライン全体を実行する。
 */

import { aggregateQualityCheck } from "../harness/checker.ts";
import {
  afterClassification,
  afterExtraction,
  afterJournalEntry,
  beforeExtraction,
} from "../harness/lifecycle.ts";
import { applyApprovedProposal, generateProposals } from "../knowledge/improver.ts";
import { buildJournalEntries, toFreeeCSV } from "../deterministic/rules.ts";
import { classifyAccount, extractInvoiceData } from "../agent/index.ts";
import { evaluateChecklist, formatChecklist } from "../harness/planner.ts";
import type { CorrectionRecord } from "../knowledge/improver.ts";
import type { HookResult, PipelineState } from "../types.ts";

const SEP_LENGTH = 60;
const SEP = "=".repeat(SEP_LENGTH);

const printSection = (title: string): void => {
  console.log(`\n${SEP}\n  ${title}\n${SEP}`);
};

const printHook = (name: string, result: HookResult): void => {
  console.log(`\n[${name}] ${result.passed ? "PASS" : "FAIL"}`);
  for (const warn of result.warnings) {
    console.log(`  ⚠ ${warn}`);
  }
  for (const err of result.errors) {
    console.log(`  ❌ ${err}`);
  }
};

const INDENT = 2;

const SAMPLE_INVOICE = `請求書
株式会社テックソリューションズ
請求番号 INV-2026-0412
請求日: 2026/04/01
お支払期限: 2026/04/30
品目: Webアプリ開発費 500,000円 / サーバー保守費 100,000円 / SSL証明書 20,000円
小計 620,000 消費税(10%) 62,000
合計 682,000`;

/** フックを実行して結果を記録・表示する */
const runHook = (state: PipelineState, name: string, result: HookResult): void => {
  printHook(name, result);
  state.hookResults.push(result);
};

/** Step1: 前処理チェック */
const runPreCheck = (state: PipelineState): void => {
  printSection("Step 1: 前処理チェック");
  runHook(state, "beforeExtraction", beforeExtraction(state.invoiceText));
};

/** Step2-3: 抽出と検証 */
const runExtraction = (state: PipelineState): void => {
  printSection("Step 2: AI 情報抽出");
  state.extracted = extractInvoiceData(state.invoiceText);
  console.log(JSON.stringify(state.extracted, null, INDENT));

  printSection("Step 3: 抽出結果チェック");
  runHook(state, "afterExtraction", afterExtraction(state.extracted));
};

/** Step4-5: 分類フェーズ */
const runClassification = (state: PipelineState): void => {
  if (state.extracted === null) {
    return;
  }
  printSection("Step 4: 勘定科目分類");
  state.classification = classifyAccount(state.extracted);
  console.log(JSON.stringify(state.classification, null, INDENT));

  printSection("Step 5: 分類結果チェック");
  const result = afterClassification(state.classification, state.extracted);
  printHook("afterClassification", result);
  state.hookResults.push(result);
};

/** Step6-7: 仕訳生成フェーズ */
const runJournalGeneration = (state: PipelineState): void => {
  if (state.extracted === null || state.classification === null) {
    return;
  }
  printSection("Step 6: 仕訳生成（決定論的）");
  const entries = buildJournalEntries(
    state.extracted,
    state.classification.debitAccountCode,
    state.classification.debitAccountName,
  );
  state.journalEntries = entries;
  console.log(JSON.stringify(entries, null, INDENT));

  printSection("Step 7: 仕訳チェック");
  const result = afterJournalEntry(entries);
  printHook("afterJournalEntry", result);
  state.hookResults.push(result);
};

/** Step8-10: 品質チェック・出力フェーズ */
const runQualityAndOutput = (state: PipelineState): void => {
  printSection("Step 8: 終了条件チェックリスト");
  state.checklist = evaluateChecklist(state);
  console.log(formatChecklist(state.checklist));

  printSection("Step 9: 品質チェック集約");
  const quality = aggregateQualityCheck(state);
  console.log(quality.summary);
  state.needsHumanReview = quality.needsHumanReview;
  state.humanReviewReasons = quality.humanReviewReasons;

  printSection("Step 10: CSV出力（freee互換）");
  console.log(toFreeeCSV(state.journalEntries));
};

/** Step11: ナレッジ改善デモ */
const runKnowledgeDemo = (): void => {
  printSection("Step 11: ナレッジ改善提案デモ");
  const corrections: CorrectionRecord[] = [
    {
      correctedAccountCode: "6310",
      correctedAccountName: "外注費",
      description: "Webアプリ開発費",
      originalAccountCode: "6510",
      vendorName: "株式会社テックソリューションズ",
    },
    {
      correctedAccountCode: "6310",
      correctedAccountName: "外注費",
      description: "システム開発費",
      originalAccountCode: "6510",
      vendorName: "株式会社テックソリューションズ",
    },
    {
      correctedAccountCode: "6310",
      correctedAccountName: "外注費",
      description: "API開発費",
      originalAccountCode: "6510",
      vendorName: "株式会社テックソリューションズ",
    },
  ];
  const proposals = generateProposals(corrections);
  for (const proposal of proposals) {
    console.log(`\n📋 改善提案: ${proposal.description}`);
    console.log(`   種別: ${proposal.type}`);
    applyApprovedProposal(proposal);
    console.log("   ✅ ナレッジストアに反映完了");
  }
};

/** 初期状態を生成する */
const createInitialState = (): PipelineState => ({
  checklist: [],
  classification: null,
  extracted: null,
  hookResults: [],
  humanReviewReasons: [],
  invoiceText: SAMPLE_INVOICE,
  journalEntries: [],
  needsHumanReview: false,
});

/** 最終結果を表示する */
const printFinalResult = (state: PipelineState): void => {
  printSection("処理完了");
  if (state.needsHumanReview) {
    console.log("⚠ 人間レビューが必要です:");
    for (const reason of state.humanReviewReasons) {
      console.log(`  - ${reason}`);
    }
  } else {
    console.log("✅ 全チェック通過 — 自動承認可能です");
  }
};

/** メインパイプライン */
const runPipeline = (): void => {
  printSection("InvoiceForge プロトタイプ デモ");
  const state = createInitialState();
  runPreCheck(state);
  runExtraction(state);
  runClassification(state);
  runJournalGeneration(state);
  runQualityAndOutput(state);
  runKnowledgeDemo();
  printFinalResult(state);
};

runPipeline();
