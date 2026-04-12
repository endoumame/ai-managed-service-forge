/**
 * ContractShield ハーネス層 - ライフサイクルフック
 *
 * なぜライフサイクルフックが必要か:
 * AIエージェントの各処理ステップの前後に検証ロジックを挟むことで、
 * ドリフト（累積的なズレ）を早期に検出・防止する。
 * フックは純粋関数として実装し、テスト容易性を確保する。
 */

import type { ClauseAnalysis, Contract, HookPhase, HookResult, ReviewReport } from "../types.ts";

const MIN_CLAUSE_COUNT = 1;
const NONE_COUNT = 0;

/** Before:parse - 入力テキストの前処理検証 */
const beforeParse = (rawText: string): HookResult => {
  const trimmed = rawText.trim();
  const passed = trimmed.length > NONE_COUNT;
  return {
    details: { length: trimmed.length },
    message: passed ? "入力テキストが存在します" : "入力テキストが空です",
    passed,
    phase: "before:parse" as HookPhase,
  };
};

/** After:parse - パース結果の検証 */
const afterParse = (contract: Contract): HookResult => {
  const passed = contract.clauses.length >= MIN_CLAUSE_COUNT;
  return {
    details: { clauseCount: contract.clauses.length, title: contract.title },
    message: passed
      ? `${contract.clauses.length}件の条項を検出しました`
      : "条項が検出されませんでした。契約書の形式を確認してください",
    passed,
    phase: "after:parse" as HookPhase,
  };
};

/** Before:analyze - 分析前の条項キュー確認 */
const beforeAnalyze = (contract: Contract): HookResult => {
  const hasClauses = contract.clauses.length >= MIN_CLAUSE_COUNT;
  return {
    details: { queuedClauses: contract.clauses.length },
    message: hasClauses
      ? `${contract.clauses.length}件の条項を分析キューに投入します`
      : "分析対象の条項がありません",
    passed: hasClauses,
    phase: "before:analyze" as HookPhase,
  };
};

/** After:analyze - 分析結果の一貫性チェック */
const afterAnalyze = (contract: Contract, analyses: ClauseAnalysis[]): HookResult => {
  const allAnalyzed = analyses.length === contract.clauses.length;
  const noPending = analyses.every((an) => an.status !== "pending");
  const passed = allAnalyzed && noPending;

  return {
    details: {
      analyzed: analyses.length,
      pending: analyses.filter((an) => an.status === "pending").length,
      total: contract.clauses.length,
    },
    message: passed
      ? "全条項の分析が完了しました"
      : `未分析の条項があります (${analyses.length}/${contract.clauses.length})`,
    passed,
    phase: "after:analyze" as HookPhase,
  };
};

/** Before:report - レポート生成前の完了確認 */
const beforeReport = (analyses: ClauseAnalysis[]): HookResult => {
  const noPending = analyses.every((an) => an.status !== "pending");
  return {
    details: { analyzedCount: analyses.length },
    message: noPending
      ? "全条項の分析が完了しており、レポート生成可能です"
      : "未分析の条項が残っています",
    passed: noPending,
    phase: "before:report" as HookPhase,
  };
};

/** After:report - レポートの完全性検証 */
const afterReport = (report: ReviewReport): HookResult => {
  const allIncluded = report.analyzedClauses === report.totalClauses;
  return {
    details: {
      analyzed: report.analyzedClauses,
      humanReviewRequired: report.humanReviewRequired,
      total: report.totalClauses,
    },
    message: allIncluded
      ? "レポートに全条項が含まれています"
      : `レポートに含まれていない条項があります (${report.analyzedClauses}/${report.totalClauses})`,
    passed: allIncluded,
    phase: "after:report" as HookPhase,
  };
};

export { afterAnalyze, afterParse, afterReport, beforeAnalyze, beforeParse, beforeReport };
