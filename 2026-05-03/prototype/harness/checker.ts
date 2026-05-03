// ハーネスの品質チェック機構
// AIの出力を「信頼しない」前提で、決定論的に品質を検証する

import type {
  CheckStatus,
  ChecklistItem,
  ExtractedData,
  HarnessConfig,
  JournalEntry,
  QualityCheckResult,
  RawInvoice,
} from "../types.ts";
import { DEFAULT_CONFIG } from "../types.ts";

const ZERO = 0;
const PERCENT_MULTIPLIER = 100;
const BALANCE_CHECK_INDEX = 0;
const RECONCILIATION_CHECK_INDEX = 1;

interface CheckContext {
  extracted: ExtractedData;
  journal: JournalEntry;
  original: RawInvoice;
  config?: HarnessConfig;
  historicalAmounts?: number[];
}

const checkDebitCreditBalance = (journal: JournalEntry): { passed: boolean; message: string } => {
  const debitTotal = journal.entries
    .filter((entry) => entry.side === "debit")
    .reduce((sum, entry) => sum + entry.amount + (entry.taxAmount ?? ZERO), ZERO);
  const creditTotal = journal.entries
    .filter((entry) => entry.side === "credit")
    .reduce((sum, entry) => sum + entry.amount + (entry.taxAmount ?? ZERO), ZERO);

  const passed = debitTotal === creditTotal;
  const message = passed
    ? `借方 ${debitTotal} = 貸方 ${creditTotal}`
    : `借方 ${debitTotal} != 貸方 ${creditTotal} (差額: ${Math.abs(debitTotal - creditTotal)})`;
  return { message, passed };
};

const checkAmountReconciliation = (
  extracted: ExtractedData,
  original: RawInvoice,
): { passed: boolean; message: string } => {
  const passed = extracted.totalAmount === original.totalAmount;
  const message = passed
    ? `抽出金額 ${extracted.totalAmount} = 原本金額 ${original.totalAmount}`
    : `抽出金額 ${extracted.totalAmount} != 原本金額 ${original.totalAmount}`;
  return { message, passed };
};

const checkConfidence = (
  extracted: ExtractedData,
  threshold: number,
): { passed: boolean; message: string; lowConfidenceItems: string[] } => {
  const lowConfidenceItems = extracted.items
    .filter((item) => item.confidence < threshold)
    .map((item) => `${item.description} (confidence: ${item.confidence})`);

  const passed = extracted.confidence >= threshold && lowConfidenceItems.length === ZERO;
  const message = passed
    ? `全体信頼度 ${extracted.confidence} >= 閾値 ${threshold}`
    : `信頼度不足: 全体=${extracted.confidence}, 低信頼項目=${lowConfidenceItems.length}件`;
  return { lowConfidenceItems, message, passed };
};

const checkHighValue = (
  extracted: ExtractedData,
  threshold: number,
): { isHighValue: boolean; message: string } => {
  const isHighValue = extracted.totalAmount >= threshold;
  const message = isHighValue
    ? `高額請求: ${extracted.totalAmount.toLocaleString()}円 >= 閾値 ${threshold.toLocaleString()}円`
    : `通常金額: ${extracted.totalAmount.toLocaleString()}円`;
  return { isHighValue, message };
};

const checkAnomaly = (
  extracted: ExtractedData,
  ctx: { deviationPercent: number; historicalAmounts: number[] },
): { isAnomaly: boolean; message: string } => {
  if (ctx.historicalAmounts.length === ZERO) {
    return { isAnomaly: false, message: "過去データなし（初回取引先）" };
  }
  const avg =
    ctx.historicalAmounts.reduce((acc, val) => acc + val, ZERO) / ctx.historicalAmounts.length;
  const deviation = (Math.abs(extracted.totalAmount - avg) / avg) * PERCENT_MULTIPLIER;
  const isAnomaly = deviation > ctx.deviationPercent;
  const message = isAnomaly
    ? `異常値検知: 平均 ${Math.round(avg)}円 に対し ${extracted.totalAmount}円 (乖離率 ${Math.round(deviation)}%)`
    : `正常範囲: 平均 ${Math.round(avg)}円 に対し ${extracted.totalAmount}円 (乖離率 ${Math.round(deviation)}%)`;
  return { isAnomaly, message };
};

interface IndividualCheckResult {
  id: string;
  name: string;
  passed: boolean;
  message: string;
  triggersHumanReview?: boolean;
  humanReviewPrefix?: string;
}

const buildChecklistEntries = (results: IndividualCheckResult[], now: string): ChecklistItem[] =>
  results.map((result) => ({
    id: result.id,
    message: result.message,
    name: result.name,
    status: (result.passed ? "passed" : "failed") as CheckStatus,
    timestamp: now,
  }));

const collectHumanReviewReasons = (results: IndividualCheckResult[]): string[] =>
  results
    .filter((result) => result.triggersHumanReview === true && !result.passed)
    .map((result) => `${result.humanReviewPrefix ?? result.name}: ${result.message}`);

const executeAllChecks = (ctx: CheckContext, config: HarnessConfig): IndividualCheckResult[] => {
  const balance = checkDebitCreditBalance(ctx.journal);
  const reconciliation = checkAmountReconciliation(ctx.extracted, ctx.original);
  const confidence = checkConfidence(ctx.extracted, config.confidenceThreshold);
  const highValue = checkHighValue(ctx.extracted, config.highValueThreshold);
  const anomaly = checkAnomaly(ctx.extracted, {
    deviationPercent: config.anomalyDeviationPercent,
    historicalAmounts: ctx.historicalAmounts ?? [],
  });

  return [
    { id: "balance", message: balance.message, name: "借貸バランス", passed: balance.passed },
    {
      id: "reconciliation",
      message: reconciliation.message,
      name: "金額突合",
      passed: reconciliation.passed,
    },
    {
      humanReviewPrefix: "信頼度不足",
      id: "confidence",
      message: confidence.message,
      name: "信頼度チェック",
      passed: confidence.passed,
      triggersHumanReview: true,
    },
    {
      humanReviewPrefix: "高額請求",
      id: "high_value",
      message: highValue.message,
      name: "高額チェック",
      passed: !highValue.isHighValue,
      triggersHumanReview: true,
    },
    {
      humanReviewPrefix: "異常値",
      id: "anomaly",
      message: anomaly.message,
      name: "異常値チェック",
      passed: !anomaly.isAnomaly,
      triggersHumanReview: true,
    },
  ];
};

const runQualityChecks = (ctx: CheckContext): QualityCheckResult => {
  const config = ctx.config ?? DEFAULT_CONFIG;
  const results = executeAllChecks(ctx, config);
  const checks = buildChecklistEntries(results, new Date().toISOString());
  const humanReviewReasons = collectHumanReviewReasons(results);
  const criticalPassed =
    results[BALANCE_CHECK_INDEX].passed && results[RECONCILIATION_CHECK_INDEX].passed;

  return {
    checks,
    humanReviewReasons,
    passed: criticalPassed && humanReviewReasons.length === ZERO,
    requiresHumanReview: humanReviewReasons.length > ZERO,
  };
};

export { type CheckContext, runQualityChecks };
