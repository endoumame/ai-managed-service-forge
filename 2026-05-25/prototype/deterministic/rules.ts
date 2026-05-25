/* eslint-disable no-magic-numbers, require-await, max-statements, max-lines-per-function, id-length, no-console, no-undefined, no-await-in-loop, no-use-before-define, sort-imports, max-params, unicorn/consistent-function-scoping, unicorn/prefer-top-level-await, unicorn/no-array-callback-reference, import/no-nodejs-modules, import/no-duplicates, typescript/no-unsafe-member-access, typescript/no-unsafe-call, typescript/no-unsafe-assignment, typescript/no-unsafe-argument, typescript/no-unsafe-type-assertion, typescript/no-non-null-assertion, typescript/explicit-function-return-type, typescript/require-await, typescript/strict-boolean-expressions, prefer-destructuring */
// 決定論的コード層: ルールベース処理
// AIに任せず確実に計算する部分。税額計算・フォーマット変換・重複検知

import type { ExtractedInvoice, JournalEntry } from "../types.ts";

const AMOUNT_TOLERANCE = 1;
const MIN_INVOICE_NUMBER_LENGTH = 1;
const MAX_INVOICE_NUMBER_LENGTH = 50;

interface TaxCalculation {
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
}

interface DuplicateCheckResult {
  isDuplicate: boolean;
  matchedInvoiceNumber?: string;
  matchedDate?: string;
}

const calculateTax = (subtotal: number, taxRate: number): TaxCalculation => {
  const taxAmount = Math.floor(subtotal * taxRate);
  return {
    subtotal,
    taxAmount,
    taxRate,
    total: subtotal + taxAmount,
  };
};

const buildJournalEntry = (
  extracted: ExtractedInvoice,
  debitAccountCode: string,
  confidence: number,
): JournalEntry => ({
  confidence,
  creditAccount: "212",
  creditAmount: extracted.totalAmount,
  date: extracted.invoiceDate,
  debitAccount: debitAccountCode,
  debitAmount: extracted.totalAmount,
  description: `${extracted.vendorName} ${extracted.invoiceNumber}`,
  vendorName: extracted.vendorName,
});

const checkDuplicate = (
  invoice: ExtractedInvoice,
  processedInvoices: { invoiceNumber: string; invoiceDate: string; totalAmount: number }[],
): DuplicateCheckResult => {
  const match = processedInvoices.find(
    (prev) =>
      prev.invoiceNumber === invoice.invoiceNumber &&
      prev.invoiceDate === invoice.invoiceDate &&
      Math.abs(prev.totalAmount - invoice.totalAmount) < AMOUNT_TOLERANCE,
  );

  if (match) {
    return {
      isDuplicate: true,
      matchedDate: match.invoiceDate,
      matchedInvoiceNumber: match.invoiceNumber,
    };
  }

  return { isDuplicate: false };
};

const validateInvoiceNumberFormat = (invoiceNumber: string): boolean =>
  invoiceNumber.length >= MIN_INVOICE_NUMBER_LENGTH &&
  invoiceNumber.length <= MAX_INVOICE_NUMBER_LENGTH;

// 適格請求書発行事業者番号: T + 13桁の数字
const validateQualifiedInvoiceNumber = (number: string): boolean => /^T\d{13}$/.test(number);

const formatCurrency = (amount: number): string => `¥${amount.toLocaleString("ja-JP")}`;

const formatJournalAsCSV = (entries: JournalEntry[]): string => {
  const header = "日付,借方科目,借方金額,貸方科目,貸方金額,摘要";
  const rows = entries.map(
    (entry) =>
      `${entry.date},${entry.debitAccount},${entry.debitAmount},${entry.creditAccount},${entry.creditAmount},${entry.description}`,
  );
  return [header, ...rows].join("\n");
};

export {
  calculateTax,
  buildJournalEntry,
  checkDuplicate,
  validateInvoiceNumberFormat,
  validateQualifiedInvoiceNumber,
  formatCurrency,
  formatJournalAsCSV,
};
