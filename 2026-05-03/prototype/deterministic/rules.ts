// 決定論的コード層: ルールベース処理
// AIに任せず確実に正しい結果を返す計算・判定ロジック

import type { ExtractedData, ExtractedItem, JournalEntry, JournalLine } from "../types.ts";

const ZERO = 0;
const ONE = 1;
const STANDARD_TAX_RATE = 0.1;
const REDUCED_TAX_RATE = 0.08;
const HIGH_APPROVAL_THRESHOLD = 100_000;

interface TaxCalculation {
  subtotal: number;
  taxAmount: number;
  total: number;
}

interface ApprovalRoute {
  approver: string;
  level: string;
  reason: string;
}

const calculateTax = (amount: number, taxRate: number): TaxCalculation => {
  const taxAmount = Math.floor(amount * taxRate);
  return {
    subtotal: amount,
    taxAmount,
    total: amount + taxAmount,
  };
};

const detectTaxRate = (description: string): number => {
  const reducedTaxKeywords = ["弁当", "飲料", "食品", "菓子", "お茶", "コーヒー", "ジュース", "水"];
  const isReduced = reducedTaxKeywords.some((keyword) => description.includes(keyword));
  return isReduced ? REDUCED_TAX_RATE : STANDARD_TAX_RATE;
};

const verifyItemAmount = (item: ExtractedItem): { valid: boolean; expected: number } => {
  const expected = item.quantity * item.unitPrice;
  return { expected, valid: item.amount === expected };
};

const buildJournalFromExtracted = (extracted: ExtractedData): JournalEntry => {
  const debitLines: JournalLine[] = extracted.items.map((item) => ({
    accountCode: item.accountCode,
    accountName: item.accountName,
    amount: item.amount,
    side: "debit" as const,
    taxAmount: Math.floor(item.amount * item.taxRate),
  }));

  const creditTotal = extracted.items.reduce(
    (sum, item) => sum + item.amount + Math.floor(item.amount * item.taxRate),
    ZERO,
  );

  const creditLine: JournalLine = {
    accountCode: "2100",
    accountName: "買掛金",
    amount: creditTotal,
    side: "credit" as const,
  };

  return {
    date: extracted.issueDate,
    entries: [...debitLines, creditLine],
    invoiceId: extracted.invoiceId,
    memo: `${extracted.vendorNormalized} ${extracted.invoiceNumber}`,
  };
};

const determineApprovalRoute = (extracted: ExtractedData): ApprovalRoute => {
  if (extracted.totalAmount >= HIGH_APPROVAL_THRESHOLD) {
    return {
      approver: "部長",
      level: "high",
      reason: `金額 ${extracted.totalAmount.toLocaleString()}円 >= ${HIGH_APPROVAL_THRESHOLD.toLocaleString()}円`,
    };
  }
  return {
    approver: "課長",
    level: "standard",
    reason: `金額 ${extracted.totalAmount.toLocaleString()}円 < ${HIGH_APPROVAL_THRESHOLD.toLocaleString()}円`,
  };
};

const isDuplicatePair = (left: ExtractedData, right: ExtractedData): boolean =>
  left.vendorNormalized === right.vendorNormalized &&
  left.totalAmount === right.totalAmount &&
  left.invoiceNumber === right.invoiceNumber;

const detectDuplicates = (invoices: ExtractedData[]): [string, string][] =>
  invoices.flatMap((current, idx) =>
    invoices
      .slice(idx + ONE)
      .filter((other) => isDuplicatePair(current, other))
      .map((other): [string, string] => [current.invoiceId, other.invoiceId]),
  );

export {
  type ApprovalRoute,
  type TaxCalculation,
  buildJournalFromExtracted,
  calculateTax,
  detectDuplicates,
  detectTaxRate,
  determineApprovalRoute,
  verifyItemAmount,
};
