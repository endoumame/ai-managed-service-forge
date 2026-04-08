/**
 * 品質チェッカー — 処理パイプライン全体の品質ゲート
 *
 * なぜこの実装か:
 * 個々のライフサイクルフックは各段階のバリデーションを担うが、
 * チェッカーはパイプライン全体を俯瞰して「本当に完了してよいか」を判定する。
 * AIエージェントの「もう十分です」という自己申告を無視し、
 * 客観的な品質基準に基づいてのみ処理完了を許可する。
 */

import type { HookResult } from "./lifecycle.ts";

interface QualityReport {
  overallPassed: boolean;
  confidenceScore: number;
  requiresHumanReview: boolean;
  humanReviewReasons: string[];
  stageResults: StageResult[];
  summary: string;
}

interface StageResult {
  stage: string;
  hookResult: HookResult;
}

const PERCENTAGE_MULTIPLIER = 100;
const DECIMAL_PLACES = 0;
const NO_SCORE = 0;
const CONFIDENCE_THRESHOLD = 0.8;
const WARNING_THRESHOLD = 3;

const hasItems = (arr: { length: number }): boolean => arr.length > NO_SCORE;

interface SummaryInput {
  passed: boolean;
  score: number;
  needsReview: boolean;
  warnings: string[];
}

const toPercent = (score: number): string =>
  (score * PERCENTAGE_MULTIPLIER).toFixed(DECIMAL_PLACES);

const generateSummary = (input: SummaryInput): string => {
  const pct = toPercent(input.score);
  const parts: string[] = [];

  if (input.passed && !input.needsReview) {
    parts.push(`全チェック通過（信頼度: ${pct}%）— 自動承認可能`);
  } else if (input.passed && input.needsReview) {
    parts.push(`チェックは通過しましたが、人間の確認が推奨されます（信頼度: ${pct}%）`);
  } else {
    parts.push(`バリデーション失敗（信頼度: ${pct}%）— 人間の確認が必要です`);
  }

  if (hasItems(input.warnings)) {
    parts.push(`警告: ${input.warnings.join(" / ")}`);
  }

  return parts.join("\n");
};

const collectHumanReviewReasons = (
  confidenceScore: number,
  stageResults: StageResult[],
): string[] => {
  const reasons: string[] = [];

  if (confidenceScore < CONFIDENCE_THRESHOLD) {
    reasons.push(`信頼度スコアが低い: ${toPercent(confidenceScore)}%（閾値: 80%）`);
  }

  const failedStages = stageResults.filter((sr) => !sr.hookResult.passed);
  for (const stage of failedStages) {
    reasons.push(`ステージ「${stage.stage}」のバリデーションが失敗しました`);
  }

  const allWarnings = stageResults.flatMap((sr) => sr.hookResult.warnings);
  if (allWarnings.length >= WARNING_THRESHOLD) {
    reasons.push(`警告が${allWarnings.length}件あります`);
  }

  return reasons;
};

/** パイプライン全体の品質を評価する */
const evaluateQuality = (stageResults: StageResult[]): QualityReport => {
  const totalChecks = stageResults.flatMap((sr) => sr.hookResult.checks);
  const passedChecks = totalChecks.filter((ch) => ch.passed);
  const allWarnings = stageResults.flatMap((sr) => sr.hookResult.warnings);
  const confidenceScore = hasItems(totalChecks)
    ? passedChecks.length / totalChecks.length
    : NO_SCORE;

  const humanReviewReasons = collectHumanReviewReasons(confidenceScore, stageResults);
  const overallPassed = stageResults.every((sr) => sr.hookResult.passed);
  const requiresHumanReview = hasItems(humanReviewReasons);
  const summary = generateSummary({
    needsReview: requiresHumanReview,
    passed: overallPassed,
    score: confidenceScore,
    warnings: allWarnings,
  });

  return {
    confidenceScore,
    humanReviewReasons,
    overallPassed,
    requiresHumanReview,
    stageResults,
    summary,
  };
};

const formatSingleStage = (stage: StageResult): string[] => {
  const stageIcon = stage.hookResult.passed ? "[PASS]" : "[FAIL]";
  const checkLines = stage.hookResult.checks.map(
    (check) => `${check.passed ? "  [v]" : "  [x]"} ${check.name}: ${check.reason}`,
  );
  const warnLines = stage.hookResult.warnings.map((warning) => `  [!] ${warning}`);
  return [`--- ${stage.stage} ${stageIcon} ---`, ...checkLines, ...warnLines, ""];
};

const formatStageLines = (report: QualityReport): string[] =>
  report.stageResults.flatMap(formatSingleStage);

/** 品質レポートを人間が読みやすい形式でフォーマットする */
const formatQualityReport = (report: QualityReport): string => {
  let statusIcon = "[NG]";
  if (report.overallPassed && report.requiresHumanReview) {
    statusIcon = "[要確認]";
  } else if (report.overallPassed) {
    statusIcon = "[OK]";
  }

  const header = [
    "==============================",
    "    品質チェックレポート",
    "==============================",
    "",
    `総合判定: ${statusIcon} 信頼度: ${toPercent(report.confidenceScore)}%`,
    "",
  ];

  const stageLines = formatStageLines(report);
  const reviewLines = report.requiresHumanReview
    ? [
        "--- 人間の確認が必要な理由 ---",
        ...report.humanReviewReasons.map((reason) => `  -> ${reason}`),
        "",
      ]
    : [];

  return [...header, ...stageLines, ...reviewLines, `サマリー: ${report.summary}`].join("\n");
};

export { evaluateQuality, formatQualityReport };
export type { QualityReport, StageResult };
