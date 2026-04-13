/**
 * ハーネス層 — 品質チェック機構
 *
 * なぜ外部品質チェックか:
 * AIに「自分の出力は正しいか？」と聞いても信頼できない（ドリフト問題）。
 * 品質チェックは決定論的なルールで外部から行い、
 * AIの自己評価に依存しない仕組みにする。
 */

/* eslint-disable no-magic-numbers, max-statements, sort-imports, typescript-eslint/strict-boolean-expressions */

import type { JournalEntry, ParsedInvoice } from "../types/index.js";
import { getVendorPattern } from "../knowledge/store.js";

const FIRST_TRANSACTION_DEVIATION = 0.5;
const LOW_DEVIATION_THRESHOLD = 0.3;
const MID_DEVIATION_THRESHOLD = 0.7;
const HIGH_CONFIDENCE_THRESHOLD = 0.9;
const MID_CONFIDENCE_THRESHOLD = 0.7;
const PERCENT = 100;
const AMOUNT_TOLERANCE = 1;

const hasNoItems = (arr: unknown[]): boolean => arr.length === 0;

// ── ヘルパー: 借方エントリとパターンの照合 ──

const matchDebitEntries = (
  journal: JournalEntry,
  accountFrequency: Record<string, number>,
): { matchCount: number; details: string[] } => {
  const details: string[] = [];
  let matchCount = 0;

  for (const entry of journal.entries) {
    if (entry.debit > 0) {
      const freq = accountFrequency[entry.accountCode];
      if (freq && freq > 0) {
        matchCount += 1;
        details.push(`✓ ${entry.accountName}(${entry.accountCode}): 過去${freq}回使用`);
      } else {
        details.push(`✗ ${entry.accountName}(${entry.accountCode}): 過去使用なし`);
      }
    }
  }

  return { details, matchCount };
};

/**
 * 過去の取引先パターンとの乖離度を計算する
 */
const calculatePatternDeviation = (
  journal: JournalEntry,
): { deviation: number; details: string[] } => {
  const pattern = getVendorPattern(journal.vendor);

  if (!pattern || pattern.processedCount < 1) {
    return {
      details: [`取引先「${journal.vendor}」の過去パターンなし（初回取引）`],
      deviation: FIRST_TRANSACTION_DEVIATION,
    };
  }

  const result = matchDebitEntries(journal, pattern.accountFrequency);
  const debitCount = journal.entries.filter((entry) => entry.debit > 0).length;
  const deviation = debitCount > 0 ? 1 - result.matchCount / debitCount : 0;

  return { details: result.details, deviation };
};

/**
 * 請求書の金額整合性を検証する
 */
const verifyAmountConsistency = (
  invoice: ParsedInvoice,
): { consistent: boolean; issues: string[] } => {
  const issues: string[] = [];

  for (const [idx, item] of invoice.lineItems.entries()) {
    const expected = item.quantity * item.unitPrice;
    if (Math.abs(expected - item.amount) > AMOUNT_TOLERANCE) {
      issues.push(
        `明細${idx + 1}: 数量(${item.quantity}) × 単価(¥${item.unitPrice}) = ¥${expected} ≠ 記載金額 ¥${item.amount}`,
      );
    }
  }

  const lineTotal = invoice.lineItems.reduce((sum, item) => sum + item.amount, 0);
  if (Math.abs(lineTotal - invoice.subtotal) > AMOUNT_TOLERANCE) {
    issues.push(`明細合計 ¥${lineTotal} ≠ 小計 ¥${invoice.subtotal}`);
  }

  const expectedTax = Math.floor(invoice.subtotal * invoice.taxRate);
  if (Math.abs(expectedTax - invoice.taxAmount) > AMOUNT_TOLERANCE) {
    issues.push(`税額 ¥${invoice.taxAmount} ≠ 期待値 ¥${expectedTax}`);
  }

  return { consistent: hasNoItems(issues), issues };
};

const getDeviationLabel = (deviation: number): string => {
  if (deviation < LOW_DEVIATION_THRESHOLD) {
    return "✓ 低（通常パターン）";
  }
  if (deviation < MID_DEVIATION_THRESHOLD) {
    return "△ 中（要確認）";
  }
  return "✗ 高（異常の可能性）";
};

const getConfidenceLabel = (confidence: number): string => {
  if (confidence >= HIGH_CONFIDENCE_THRESHOLD) {
    return "✓ 高";
  }
  if (confidence >= MID_CONFIDENCE_THRESHOLD) {
    return "△ 中";
  }
  return "✗ 低";
};

/**
 * 品質チェックのサマリを生成する
 */
const generateQualitySummary = (invoice: ParsedInvoice, journal: JournalEntry): string => {
  const amountCheck = verifyAmountConsistency(invoice);
  const patternCheck = calculatePatternDeviation(journal);

  const sections = [
    "═══ 品質チェックサマリ ═══",
    `\n[金額整合性] ${amountCheck.consistent ? "✓ PASS" : "✗ FAIL"}`,
    ...amountCheck.issues.map((issue) => `  - ${issue}`),
    `\n[パターン乖離度] ${getDeviationLabel(patternCheck.deviation)} (${(patternCheck.deviation * PERCENT).toFixed(0)}%)`,
    ...patternCheck.details.map((detail) => `  ${detail}`),
    `\n[AI確信度] ${getConfidenceLabel(invoice.confidence)} (${(invoice.confidence * PERCENT).toFixed(1)}%)`,
    "\n═══════════════════════════",
  ];

  return sections.join("\n");
};

export { calculatePatternDeviation, generateQualitySummary, verifyAmountConsistency };
