// ハーネス層: 品質チェック
// 決定論的なルールで請求書データの整合性を検証する

import type { ExtractedInvoice, JournalEntry } from "../types.ts";
import { log } from "../logger.ts";

interface QualityCheckResult {
  checkName: string;
  passed: boolean;
  message: string;
}

const THIRTY_DAYS_MS = 2_592_000_000;
const ROUNDING_TOLERANCE = 1;
const PERCENT = 100;
const NO_AMOUNT = 0;

const isWithinDateRange = (dateA: string, dateB: string): boolean =>
  Math.abs(new Date(dateA).getTime() - new Date(dateB).getTime()) < THIRTY_DAYS_MS;

const checkDuplicateInvoice = (
  invoice: ExtractedInvoice,
  processedInvoices: ExtractedInvoice[],
): QualityCheckResult => {
  const duplicate = processedInvoices.find(
    (prev) =>
      prev.vendor === invoice.vendor &&
      prev.totalAmount === invoice.totalAmount &&
      prev.invoiceId !== invoice.invoiceId &&
      isWithinDateRange(prev.invoiceDate, invoice.invoiceDate),
  );

  return {
    checkName: "重複請求チェック",
    message: duplicate
      ? `重複の可能性: ${duplicate.invoiceId} (同一取引先・同一金額・近接日付)`
      : "重複なし",
    passed: !duplicate,
  };
};

const checkTaxConsistency = (invoice: ExtractedInvoice): QualityCheckResult => {
  const expectedTax = Math.round(invoice.subtotal * invoice.taxRate);
  const diff = Math.abs(invoice.taxAmount - expectedTax);
  const withinTolerance = diff <= ROUNDING_TOLERANCE;

  return {
    checkName: "消費税整合性チェック",
    message: withinTolerance
      ? `消費税整合: ${invoice.taxAmount}円 (税率${invoice.taxRate * PERCENT}%)`
      : `消費税不整合: 期待値=${expectedTax}円, 実際=${invoice.taxAmount}円`,
    passed: withinTolerance,
  };
};

const checkJournalBalance = (entry: JournalEntry): QualityCheckResult => {
  const totalDebit = entry.debit.amount + (entry.taxEntry?.debit.amount ?? NO_AMOUNT);
  const totalCredit = entry.credit.amount + (entry.taxEntry?.credit.amount ?? NO_AMOUNT);
  const diff = Math.abs(totalDebit - totalCredit);
  const balanced = diff <= ROUNDING_TOLERANCE;

  return {
    checkName: "仕訳バランスチェック",
    message: balanced
      ? `バランスOK: 借方=${totalDebit}円, 貸方=${totalCredit}円`
      : `バランス不一致: 借方=${totalDebit}円, 貸方=${totalCredit}円`,
    passed: balanced,
  };
};

const checkInvoiceNumberFormat = (invoice: ExtractedInvoice): QualityCheckResult => {
  const isValid = /^T\d{13}$/.test(invoice.invoiceNumber);

  return {
    checkName: "インボイス番号形式チェック",
    message: isValid
      ? `形式OK: ${invoice.invoiceNumber}`
      : `不正な形式: "${invoice.invoiceNumber}" (T+13桁の数字が必要)`,
    passed: isValid,
  };
};

const runAllQualityChecks = (
  invoice: ExtractedInvoice,
  processedInvoices: ExtractedInvoice[],
): QualityCheckResult[] => {
  const results = [
    checkDuplicateInvoice(invoice, processedInvoices),
    checkTaxConsistency(invoice),
    checkInvoiceNumberFormat(invoice),
  ];

  log(`  [QualityCheck] ${invoice.invoiceId}:`);
  for (const result of results) {
    const icon = result.passed ? "✓" : "✗";
    log(`    ${icon} ${result.checkName}: ${result.message}`);
  }

  return results;
};

export {
  type QualityCheckResult,
  checkDuplicateInvoice,
  checkInvoiceNumberFormat,
  checkJournalBalance,
  checkTaxConsistency,
  runAllQualityChecks,
};
