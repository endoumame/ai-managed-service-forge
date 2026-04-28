import type { ExtractedLineItem, ExtractionResult, JournalEntry, JournalLine } from "../types.ts";
import { isValidAccountCode } from "../knowledge/store.ts";

const ZERO = 0;
const HIGH_AMOUNT_THRESHOLD = 1_000_000;
const LOW_CONFIDENCE_THRESHOLD = 0.8;
const PERCENTAGE_MULTIPLIER = 100;
const RADIX_36 = 36;

const roundYen = (amount: number): number => Math.floor(amount);

const calculateTax = (amount: number, taxRate: number): number => roundYen(amount * taxRate);

const calculateLineSubtotal = (line: ExtractedLineItem): number =>
  roundYen(line.quantity * line.unitPrice);

const buildExpenseLine = (line: ExtractedLineItem): JournalLine => {
  const subtotal = calculateLineSubtotal(line);
  return {
    accountCode: line.suggestedAccountCode,
    accountName: line.suggestedAccountName,
    credit: ZERO,
    debit: subtotal,
    description: line.description,
  };
};

const buildTaxLine = (line: ExtractedLineItem): JournalLine => {
  const subtotal = calculateLineSubtotal(line);
  const tax = calculateTax(subtotal, line.taxRate);
  return {
    accountCode: "1500",
    accountName: "仮払消費税",
    credit: ZERO,
    debit: tax,
    description: `${line.description} 消費税`,
  };
};

const buildPayableLine = (totalWithTax: number, vendorName: string): JournalLine => ({
  accountCode: "2100",
  accountName: "買掛金",
  credit: totalWithTax,
  debit: ZERO,
  description: `${vendorName} 買掛金計上`,
});

const buildLineEntries = (line: ExtractedLineItem): JournalLine[] => [
  buildExpenseLine(line),
  buildTaxLine(line),
];

const buildJournalLines = (extraction: ExtractionResult): JournalLine[] => {
  const debitLines = extraction.extractedLines.flatMap(buildLineEntries);
  const totalDebit = debitLines.reduce((sum, jl) => sum + jl.debit, ZERO);
  const payableLine = buildPayableLine(totalDebit, extraction.invoice.vendorName);
  return [...debitLines, payableLine];
};

const sumField = (lines: JournalLine[], field: "debit" | "credit"): number =>
  lines.reduce((sum, line) => sum + line[field], ZERO);

const verifyDebitCreditBalance = (lines: JournalLine[]): boolean =>
  sumField(lines, "debit") === sumField(lines, "credit");

const verifyTaxAmounts = (extraction: ExtractionResult): { passed: boolean; message: string } => {
  let calculatedTax = ZERO;
  for (const line of extraction.extractedLines) {
    calculatedTax += calculateTax(calculateLineSubtotal(line), line.taxRate);
  }

  const invoiceTax = extraction.invoice.taxAmount;
  const passed = calculatedTax === invoiceTax;
  const message = passed
    ? "税額検証OK"
    : `税額不一致: 計算値=${String(calculatedTax)}, 請求書=${String(invoiceTax)}`;

  return { message, passed };
};

const verifyAccountCodes = (lines: JournalLine[]): { passed: boolean; invalidCodes: string[] } => {
  const invalidCodes = lines
    .map((line) => line.accountCode)
    .filter((code) => !isValidAccountCode(code));

  return { invalidCodes, passed: invalidCodes.length === ZERO };
};

const determineReviewReasons = (extraction: ExtractionResult): string[] => {
  const reasons: string[] = [];

  if (extraction.invoice.totalAmount >= HIGH_AMOUNT_THRESHOLD) {
    reasons.push(`高額請求書: ${String(extraction.invoice.totalAmount)}円`);
  }

  for (const line of extraction.extractedLines) {
    if (line.confidence < LOW_CONFIDENCE_THRESHOLD) {
      reasons.push(
        `低信頼度: ${line.description} (${String(Math.round(line.confidence * PERCENTAGE_MULTIPLIER))}%)`,
      );
    }
  }

  for (const anomaly of extraction.anomalies) {
    if (anomaly.severity === "warning" || anomaly.severity === "critical") {
      reasons.push(`異常検知: ${anomaly.message}`);
    }
  }

  return reasons;
};

const calculateConfidence = (extraction: ExtractionResult): number => {
  if (extraction.extractedLines.length === ZERO) {
    return ZERO;
  }
  const total = extraction.extractedLines.reduce((sum, line) => sum + line.confidence, ZERO);
  return total / extraction.extractedLines.length;
};

const createJournalEntry = (extraction: ExtractionResult): JournalEntry => {
  const lines = buildJournalLines(extraction);
  const reviewReasons = determineReviewReasons(extraction);

  return {
    confidence: calculateConfidence(extraction),
    date: extraction.invoice.invoiceDate,
    id: `je-${Date.now().toString(RADIX_36)}`,
    invoiceId: extraction.invoice.id,
    lines,
    requiresHumanReview: reviewReasons.length > ZERO,
    reviewReasons,
    status: reviewReasons.length > ZERO ? "pending_review" : "draft",
    totalCredit: sumField(lines, "credit"),
    totalDebit: sumField(lines, "debit"),
    vendorName: extraction.invoice.vendorName,
  };
};

export {
  buildJournalLines,
  calculateConfidence,
  calculateTax,
  createJournalEntry,
  determineReviewReasons,
  roundYen,
  sumField,
  verifyAccountCodes,
  verifyDebitCreditBalance,
  verifyTaxAmounts,
};
