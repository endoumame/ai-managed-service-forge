/**
 * 品質チェッカー
 *
 * なぜこの実装か:
 * ハーネスが持つ品質チェック機構を一元管理する。
 * 個別のライフサイクルフックとは異なり、ここでは処理全体を
 * 俯瞰した品質メトリクスの集約と判定を行う。
 *
 * ドリフト問題への対策として、AIの出力を「信頼しない」前提で
 * 外部から検証する設計。
 */

import type { InvoiceData, JournalEntry } from "../deterministic/rules.ts";

interface QualityReport {
  /** 0-100 */
  overallScore: number;
  checks: QualityCheck[];
  requiresHumanReview: boolean;
  humanReviewReasons: string[];
}

interface QualityCheck {
  name: string;
  passed: boolean;
  /** 0-100 */
  score: number;
  detail: string;
}

const CONFIDENCE_THRESHOLD = 0.8;
const HIGH_AMOUNT_THRESHOLD = 100_000_000;
const NEW_VENDOR_SCORE = 50;
const EMPTY_COUNT = 0;
const SUM_INITIAL = 0;
const DEFAULT_SCORE = 0;
const SCORE_ZERO = 0;
const SCORE_LOW = 20;
const SCORE_FULL = 100;
const PERCENTAGE = 100;
const DECIMAL_PLACES = 1;

/** Checksの平均スコアを算出 */
const calcOverallScore = (checks: QualityCheck[]): number =>
  checks.length > EMPTY_COUNT
    ? Math.round(checks.reduce((sum, ck) => sum + ck.score, SUM_INITIAL) / checks.length)
    : DEFAULT_SCORE;

/** QualityReportを組み立てる */
const buildReport = (checks: QualityCheck[], humanReviewReasons: string[]): QualityReport => ({
  checks,
  humanReviewReasons,
  overallScore: calcOverallScore(checks),
  requiresHumanReview: humanReviewReasons.length > EMPTY_COUNT,
});

/** 金額の桁数妥当性チェック */
const checkAmountPlausibility = (data: InvoiceData): QualityCheck => {
  const amount = data.totalAmount;

  if (amount <= EMPTY_COUNT) {
    return {
      detail: `合計金額が0以下（${amount}円）`,
      name: "金額妥当性",
      passed: false,
      score: SCORE_ZERO,
    };
  }
  if (amount > HIGH_AMOUNT_THRESHOLD) {
    return {
      detail: `合計金額が1億円超（${amount.toLocaleString()}円）。要確認`,
      name: "金額妥当性",
      passed: false,
      score: SCORE_LOW,
    };
  }

  return {
    detail: `合計金額 ${amount.toLocaleString()}円（正常範囲）`,
    name: "金額妥当性",
    passed: true,
    score: SCORE_FULL,
  };
};

/** フィールド信頼度をチェックしてchecks/reasonsに追加 */
const evaluateFieldConfidence = (
  confidenceScores: Record<string, number>,
  checks: QualityCheck[],
  reasons: string[],
): void => {
  for (const [field, score] of Object.entries(confidenceScores)) {
    const passed = score >= CONFIDENCE_THRESHOLD;
    checks.push({
      detail: `信頼度 ${(score * PERCENTAGE).toFixed(DECIMAL_PLACES)}% ${passed ? "（閾値クリア）" : "（閾値未満）"}`,
      name: `フィールド信頼度: ${field}`,
      passed,
      score: Math.round(score * PERCENTAGE),
    });
    if (!passed) {
      reasons.push(
        `「${field}」の抽出信頼度が${(score * PERCENTAGE).toFixed(DECIMAL_PLACES)}%で閾値(${CONFIDENCE_THRESHOLD * PERCENTAGE}%)未満`,
      );
    }
  }
};

/**
 * 抽出品質のスコアリング
 * 各フィールドの信頼度を集約して全体スコアを算出
 */
const assessExtractionQuality = (
  data: InvoiceData,
  confidenceScores: Record<string, number>,
): QualityReport => {
  const checks: QualityCheck[] = [];
  const reasons: string[] = [];

  evaluateFieldConfidence(confidenceScores, checks, reasons);

  const amountCheck = checkAmountPlausibility(data);
  checks.push(amountCheck);
  if (!amountCheck.passed) {
    reasons.push(amountCheck.detail);
  }

  return buildReport(checks, reasons);
};

/**
 * 仕訳の整合性を総合チェック
 */
const assessJournalQuality = (
  invoice: InvoiceData,
  entry: JournalEntry,
  isNewVendor: boolean,
): QualityReport => {
  const checks: QualityCheck[] = [];
  const reasons: string[] = [];

  checks.push({
    detail: `科目「${entry.accountCode}: ${entry.accountName}」の推定信頼度 ${(entry.confidence * PERCENTAGE).toFixed(DECIMAL_PLACES)}%`,
    name: "仕訳科目信頼度",
    passed: entry.confidence >= CONFIDENCE_THRESHOLD,
    score: Math.round(entry.confidence * PERCENTAGE),
  });

  if (entry.confidence < CONFIDENCE_THRESHOLD) {
    reasons.push(
      `仕訳科目の信頼度が${(entry.confidence * PERCENTAGE).toFixed(DECIMAL_PLACES)}%で閾値未満`,
    );
  }

  if (isNewVendor) {
    checks.push({
      detail: `取引先「${invoice.vendorName}」は初回処理。人間の確認が必要`,
      name: "新規取引先",
      passed: false,
      score: NEW_VENDOR_SCORE,
    });
    reasons.push(`新規取引先「${invoice.vendorName}」の初回処理`);
  }

  return buildReport(checks, reasons);
};

export { assessExtractionQuality, assessJournalQuality };
export type { QualityCheck, QualityReport };
