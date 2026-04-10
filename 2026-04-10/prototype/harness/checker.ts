/**
 * ハーネス層 — 品質チェック（異常検知）
 *
 * なぜハーネスが異常検知を行うか:
 * AIエージェントは「自分の出力が正しい」と過信しがちである（ドリフト問題）。
 * ハーネスが独立した視点で異常を検知し、ヒューマンレビューをトリガーする。
 */

import type { AnomalyCheck, AnomalyResult, Invoice } from "../types.ts";
import { detectDuplicates } from "../deterministic/rules.ts";

/** 異常スコアの閾値（これを超えたらヒューマンレビュー必須） */
const ANOMALY_THRESHOLD = 0.7;

/** 金額乖離率の閾値（過去平均の±30%） */
const AMOUNT_DEVIATION_THRESHOLD = 0.3;

/** 高額取引の閾値（円） */
const HIGH_AMOUNT_THRESHOLD = 1_000_000;

/** 高額取引の異常スコア */
const HIGH_AMOUNT_SCORE = 0.5;

/** 新規取引先の異常スコア */
const NEW_VENDOR_SCORE = 0.4;

/** パーセント変換用の乗数 */
const PERCENT_MULTIPLIER = 100;

/** ToFixed の小数桁数 */
const FIXED_DIGITS = 1;

/** スコア初期値 */
const SCORE_INITIAL = 0;

/** 取引先の過去実績（プロトタイプ用の簡易データ） */
interface VendorHistory {
  vendor: string;
  averageAmount: number;
  invoiceCount: number;
}

/** 金額乖離率チェック */
const checkAmountDeviation = (invoice: Invoice, history: VendorHistory[]): AnomalyCheck | null => {
  const vendorHistory = history.find((vh) => vh.vendor === invoice.vendor) ?? null;
  if (vendorHistory === null) {
    return null;
  }

  const deviation =
    Math.abs(invoice.totalAmount - vendorHistory.averageAmount) / vendorHistory.averageAmount;
  if (deviation > AMOUNT_DEVIATION_THRESHOLD) {
    return {
      details: { averageAmount: vendorHistory.averageAmount, deviation },
      message: `金額乖離: 過去平均${vendorHistory.averageAmount}円に対し${invoice.totalAmount}円（乖離率${(deviation * PERCENT_MULTIPLIER).toFixed(FIXED_DIGITS)}%）`,
      score: Math.min(deviation, ANOMALY_THRESHOLD + AMOUNT_DEVIATION_THRESHOLD),
      type: "amount_deviation",
    };
  }
  return null;
};

/** 新規取引先チェック */
const checkNewVendor = (invoice: Invoice, history: VendorHistory[]): AnomalyCheck | null => {
  const known = history.some((vh) => vh.vendor === invoice.vendor);
  if (!known) {
    return {
      details: { vendor: invoice.vendor },
      message: `新規取引先: ${invoice.vendor}（過去の取引履歴なし）`,
      score: NEW_VENDOR_SCORE,
      type: "new_vendor",
    };
  }
  return null;
};

/** 高額取引チェック */
const checkHighAmount = (invoice: Invoice): AnomalyCheck | null => {
  if (invoice.totalAmount >= HIGH_AMOUNT_THRESHOLD) {
    return {
      details: { amount: invoice.totalAmount, threshold: HIGH_AMOUNT_THRESHOLD },
      message: `高額取引: ${invoice.totalAmount}円（閾値: ${HIGH_AMOUNT_THRESHOLD}円）`,
      score: HIGH_AMOUNT_SCORE,
      type: "high_amount",
    };
  }
  return null;
};

/** 個別チェック結果を収集（nullを除外） */
const collectChecks = (
  invoice: Invoice,
  pastInvoices: Invoice[],
  vendorHistory: VendorHistory[],
): AnomalyCheck[] => {
  const results = [
    checkAmountDeviation(invoice, vendorHistory),
    detectDuplicates(invoice, pastInvoices),
    checkNewVendor(invoice, vendorHistory),
    checkHighAmount(invoice),
  ];
  return results.filter((check): check is AnomalyCheck => check !== null);
};

/** チェック結果の最大スコアを算出 */
const calcMaxScore = (checks: AnomalyCheck[]): number => {
  let max = SCORE_INITIAL;
  for (const check of checks) {
    max = Math.max(max, check.score);
  }
  return max;
};

/** 全異常チェックを実行して結果を集約 */
const runAnomalyChecks = (
  invoice: Invoice,
  pastInvoices: Invoice[],
  vendorHistory: VendorHistory[],
): AnomalyResult => {
  const checks = collectChecks(invoice, pastInvoices, vendorHistory);
  const maxScore = calcMaxScore(checks);

  return {
    checks,
    invoiceId: invoice.id,
    needsHumanReview: maxScore >= ANOMALY_THRESHOLD,
    overallScore: maxScore,
  };
};

export { runAnomalyChecks };

export type { VendorHistory };
