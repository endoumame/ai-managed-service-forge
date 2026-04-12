/**
 * ContractShield デモエントリポイント
 *
 * ハーネス・AIエージェント・決定論的コードの三位一体を
 * 1つの契約書レビューパイプラインとして統合実行する。
 */

import {
  afterAnalyze,
  afterParse,
  afterReport,
  beforeAnalyze,
  beforeParse,
  beforeReport,
} from "../harness/lifecycle.ts";
import {
  createChecklist,
  getProgress,
  markReportGenerated,
  updateChecklist,
} from "../harness/planner.ts";
import { formatReportAsMarkdown, generateReport } from "../deterministic/report.ts";
import type { HookResult } from "../types.ts";
import { analyzeAllClauses } from "../agent/index.ts";
import { createDB } from "../knowledge/store.ts";
import { parseContract } from "../deterministic/rules.ts";
import { print } from "./output.ts";
import { proposeRiskCorrection } from "../knowledge/improver.ts";
import { runAllChecks } from "../harness/checker.ts";

const SEPARATOR_LENGTH = 60;

/** サンプル契約書（デモ用） */
const SAMPLE_CONTRACT = `業務委託契約書

株式会社サンプル（以下「甲」という）と株式会社テスト（以下「乙」という）は、以下の通り業務委託契約を締結する。

第1条（目的）
甲は乙に対し、システム開発業務を委託し、乙はこれを受託する。

第2条（契約期間）
本契約の有効期間は、2026年4月1日から2027年3月31日までとする。

第3条（対価）
甲は乙に対し、業務委託料として月額100万円を支払う。
支払いは毎月末日締め、翌月末日払いとする。

第4条（秘密保持）
甲及び乙は、本契約に関連して知り得た相手方の秘密情報を、第三者に開示してはならない。

第5条（損害賠償）
乙が本契約に違反した場合、甲に生じた損害の全額を賠償するものとする。

第6条（解約）
甲は、30日前の書面による通知により、本契約を解約することができる。
乙からの解約は認められない。

第7条（知的財産権）
本契約に基づき乙が作成した成果物の知的財産権は、全て甲に帰属する。

第8条（準拠法）
本契約は、日本法に準拠する。
`;

/** フック結果を出力する */
const logHook = (result: HookResult): void => {
  const icon = result.passed ? "[PASS]" : "[FAIL]";
  print(`  ${icon} ${result.phase}: ${result.message}`);
};

/** セクションヘッダーを出力する */
const logSection = (title: string): void => {
  print(`\n${"=".repeat(SEPARATOR_LENGTH)}`);
  print(`  ${title}`);
  print("=".repeat(SEPARATOR_LENGTH));
};

/** パイプラインのパース段階を実行する */
const runParsePhase = (rawText: string): ReturnType<typeof parseContract> => {
  logSection("Phase 1: 契約書パース");
  logHook(beforeParse(rawText));

  const contract = parseContract(rawText);
  logHook(afterParse(contract));

  print(`  検出された条項: ${contract.clauses.length}件`);
  for (const clause of contract.clauses) {
    print(`    第${clause.number}条 [${clause.category}] ${clause.title}`);
  }
  return contract;
};

/** パイプラインの分析段階を実行する */
const runAnalyzePhase = async (
  contract: ReturnType<typeof parseContract>,
): Promise<Awaited<ReturnType<typeof analyzeAllClauses>>> => {
  logSection("Phase 2: AIリスク分析");
  logHook(beforeAnalyze(contract));

  print("  モックモードで分析を実行中...");
  const analyses = await analyzeAllClauses(contract.clauses);
  logHook(afterAnalyze(contract, analyses));

  for (const analysis of analyses) {
    print(
      `    ${analysis.clauseId}: リスク=${analysis.riskLevel} スコア=${analysis.riskScore} 確信度=${analysis.confidence}`,
    );
  }
  return analyses;
};

/** パイプラインのレポート段階を実行する */
const runReportPhase = (
  contract: ReturnType<typeof parseContract>,
  analyses: Awaited<ReturnType<typeof analyzeAllClauses>>,
): ReturnType<typeof generateReport> => {
  logSection("Phase 3: レポート生成");
  logHook(beforeReport(analyses));

  const report = generateReport(contract, analyses);
  logHook(afterReport(report));
  return report;
};

/** 品質チェック段階を実行する */
const runQualityCheck = (
  contract: ReturnType<typeof parseContract>,
  analyses: Awaited<ReturnType<typeof analyzeAllClauses>>,
): void => {
  logSection("Phase 4: 品質チェック");
  const quality = runAllChecks(contract, analyses);
  const qualityIcon = quality.passed ? "[PASS]" : "[WARN]";
  print(`  ${qualityIcon} 品質チェック結果`);
  for (const issue of quality.issues) {
    print(`    - ${issue}`);
  }
};

/** チェックリスト段階を実行する */
const runChecklistPhase = (
  contract: ReturnType<typeof parseContract>,
  analyses: Awaited<ReturnType<typeof analyzeAllClauses>>,
): void => {
  logSection("Phase 5: 終了条件チェック");
  let checklist = createChecklist(contract);
  checklist = updateChecklist(checklist, analyses);
  checklist = markReportGenerated(checklist);

  const progress = getProgress(checklist);
  print(`  進捗: ${progress.completed}/${progress.total} (${progress.percentage}%)`);

  for (const item of checklist.items) {
    const icon = item.completed ? "[x]" : "[ ]";
    print(`    ${icon} ${item.description}`);
  }
};

/** ナレッジ改善デモを実行する */
const runKnowledgeDemo = (analyses: Awaited<ReturnType<typeof analyzeAllClauses>>): void => {
  logSection("Phase 6: ナレッジ改善ループ（デモ）");
  const [firstAnalysis] = analyses;

  print(
    `  シミュレーション: 条項${firstAnalysis.clauseId}のリスクを「${firstAnalysis.riskLevel}」→「medium」に修正`,
  );

  const knowledgeDB = proposeRiskCorrection({
    correctedLevel: "medium",
    db: createDB(),
    feedback: "この条項は一般的な目的条項であり、リスクは中程度と判断",
    original: firstAnalysis,
  });

  print(`  ナレッジDB: ${knowledgeDB.entries.length}件のエントリ`);
  print(`  改善提案: ${knowledgeDB.proposals.length}件（承認待ち）`);
  for (const proposal of knowledgeDB.proposals) {
    print(`    - [${proposal.status}] ${proposal.description}`);
  }
};

/** バナーを表示する */
const printBanner = (): void => {
  print("ContractShield - 契約書リスク自動スクリーニング");
  print("================================================");
  print("モード: デモ（モック分析）");
};

/** 最終結果を表示する */
const printFinalResult = (report: ReturnType<typeof generateReport>): void => {
  logSection("最終レポート");
  print(formatReportAsMarkdown(report));
  logSection("完了");
  print("  ContractShield デモが正常に完了しました。");
  print("  高リスク条項が検出された場合、法務担当者によるレビューが必要です。");
};

/** メインパイプライン */
const main = async (): Promise<void> => {
  printBanner();
  const contract = runParsePhase(SAMPLE_CONTRACT);
  const analyses = await runAnalyzePhase(contract);
  const report = runReportPhase(contract, analyses);
  runQualityCheck(contract, analyses);
  runChecklistPhase(contract, analyses);
  runKnowledgeDemo(analyses);
  printFinalResult(report);
};

await main();
