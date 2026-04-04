/**
 * ハーネス 品質チェッカー
 *
 * AIの自己過信（ドリフト問題）に対抗するため、
 * 外部から客観的に品質を評価する。
 */

import type { HookResult, PipelineState } from "../types.ts";

interface QualityResult {
  overallPassed: boolean;
  needsHumanReview: boolean;
  humanReviewReasons: string[];
  summary: string;
}

interface CollectedMessages {
  warnings: string[];
  errors: string[];
}

const CONFIDENCE_THRESHOLD = 0.75;
const PERCENT = 100;
const WARNING_COUNT_THRESHOLD = 3;
const DEVIATION_RATIO = 3;
const RATIO_DECIMALS = 1;
const INITIAL_SUM = 0;

/** 信頼度スコアをパーセント文字列に変換する */
const toPercent = (score: number): string => String(Math.round(score * PERCENT));

/** フック結果からエラーと警告を収集する */
const collectHookMessages = (state: PipelineState): CollectedMessages => {
  const warnings: string[] = [];
  const errors: string[] = [];
  for (const result of state.hookResults) {
    warnings.push(...result.warnings);
    errors.push(...result.errors);
  }
  return { errors, warnings };
};

/** 信頼度に基づくレビュー理由を収集する */
const collectConfidenceReasons = (state: PipelineState): string[] => {
  const reasons: string[] = [];
  const threshold = toPercent(CONFIDENCE_THRESHOLD);
  if (state.extracted && state.extracted.confidenceScore < CONFIDENCE_THRESHOLD) {
    reasons.push(
      `AI抽出の信頼度が閾値未満: ${toPercent(state.extracted.confidenceScore)}% < ${threshold}%`,
    );
  }
  if (state.classification && state.classification.confidence < CONFIDENCE_THRESHOLD) {
    reasons.push(
      `勘定科目分類の信頼度が閾値未満: ${toPercent(state.classification.confidence)}% < ${threshold}%`,
    );
  }
  return reasons;
};

/** レビュー理由を全て統合する */
const buildReviewReasons = (messages: CollectedMessages, state: PipelineState): string[] => {
  const reasons: string[] = [];
  if (messages.errors.length > INITIAL_SUM) {
    reasons.push(...messages.errors.map((err) => `[エラー] ${err}`));
  }
  reasons.push(...collectConfidenceReasons(state));
  if (messages.warnings.length >= WARNING_COUNT_THRESHOLD) {
    reasons.push(`警告が${messages.warnings.length}件あります。全体的な確認を推奨します`);
  }
  return reasons;
};

/** サマリー文字列を組み立てる */
const formatSummary = (result: QualityResult): string => {
  const lines = [
    `品質チェック結果: ${result.overallPassed ? "PASS" : "FAIL"}`,
    `  人間レビュー: ${result.needsHumanReview ? "必要" : "不要"}`,
  ];
  if (result.humanReviewReasons.length > INITIAL_SUM) {
    lines.push(...result.humanReviewReasons.map((reason) => `  - ${reason}`));
  }
  return lines.join("\n");
};

/** 全フック結果を集約し、パイプラインの最終品質判定を行う */
const aggregateQualityCheck = (state: PipelineState): QualityResult => {
  const messages = collectHookMessages(state);
  const humanReviewReasons = buildReviewReasons(messages, state);
  const needsHumanReview = humanReviewReasons.length > INITIAL_SUM;
  const overallPassed = messages.errors.length === INITIAL_SUM;
  const partial = { humanReviewReasons, needsHumanReview, overallPassed, summary: "" };
  return { ...partial, summary: formatSummary(partial) };
};

/** 過去の仕訳との乖離チェック（ナレッジストアと連携） */
const checkHistoricalDeviation = (
  vendorName: string,
  amount: number,
  historicalAmounts: number[],
): HookResult => {
  const warnings: string[] = [];
  const errors: string[] = [];
  if (historicalAmounts.length === INITIAL_SUM) {
    warnings.push(`取引先「${vendorName}」の過去データがありません（初回取引）`);
    return { errors, passed: true, warnings };
  }
  const avg =
    historicalAmounts.reduce((sum, val) => sum + val, INITIAL_SUM) / historicalAmounts.length;
  const ratio = amount / avg;
  if (ratio > DEVIATION_RATIO) {
    warnings.push(`金額が過去平均の${ratio.toFixed(RATIO_DECIMALS)}倍です`);
  }
  return { errors, passed: true, warnings };
};

export { type QualityResult, aggregateQualityCheck, checkHistoricalDeviation };
