import type { CompletionChecklist, ExtractedInvoiceData, Invoice, JournalEntry } from "../types.ts";

// oxlint-disable eslint(no-magic-numbers) -- チェックリスト評価は境界値0との比較が本質的に必要

// 終了条件管理: AIに「完了」を自己申告させず、ハーネスが外部から判定する
// ドリフト対策の中核 — 全条件を決定論的に評価する

// oxlint-disable-next-line eslint(no-magic-numbers) -- 日本の標準消費税率
const STANDARD_TAX_RATE = 0.1;
// oxlint-disable-next-line eslint(no-magic-numbers) -- 端数処理の許容誤差
const ROUNDING_TOLERANCE = 1;

const checkFieldsExtracted = (data: ExtractedInvoiceData | null): boolean =>
  data !== null &&
  data.vendorName.length > 0 &&
  data.invoiceNumber.length > 0 &&
  data.invoiceDate.length > 0 &&
  data.items.length > 0 &&
  data.totalAmount > 0;

const checkAccountAssigned = (entry: JournalEntry | null): boolean =>
  entry !== null &&
  entry.debitEntries.length > 0 &&
  entry.creditEntries.length > 0 &&
  entry.debitEntries.every((de) => de.accountCode.length > 0) &&
  entry.creditEntries.every((ce) => ce.accountCode.length > 0);

const checkBalance = (entry: JournalEntry | null): boolean => {
  if (!entry) {
    return false;
  }
  const debitTotal = entry.debitEntries.reduce((sum, de) => sum + de.amount, 0);
  const creditTotal = entry.creditEntries.reduce((sum, ce) => sum + ce.amount, 0);
  return Math.abs(debitTotal - creditTotal) <= ROUNDING_TOLERANCE;
};

const checkTax = (data: ExtractedInvoiceData | null): boolean => {
  if (!data) {
    return false;
  }
  const expectedTax = Math.floor(data.subtotal * STANDARD_TAX_RATE);
  return Math.abs(data.taxAmount - expectedTax) <= ROUNDING_TOLERANCE;
};

const evaluateChecklist = (invoice: Invoice): CompletionChecklist => ({
  accountCodeAssigned: checkAccountAssigned(invoice.journalEntry),
  allFieldsExtracted: checkFieldsExtracted(invoice.extractedData),
  approvalQueueSubmitted:
    invoice.status === "awaiting_approval" ||
    invoice.status === "approved" ||
    invoice.status === "corrected",
  debitCreditBalanced: checkBalance(invoice.journalEntry),
  taxConsistent: checkTax(invoice.extractedData),
});

const isComplete = (checklist: CompletionChecklist): boolean =>
  checklist.allFieldsExtracted &&
  checklist.accountCodeAssigned &&
  checklist.debitCreditBalanced &&
  checklist.taxConsistent &&
  checklist.approvalQueueSubmitted;

const mark = (val: boolean): string => (val ? "✓" : "✗");

const formatChecklist = (checklist: CompletionChecklist): string =>
  [
    `  [${mark(checklist.allFieldsExtracted)}] 全必須項目抽出済み`,
    `  [${mark(checklist.accountCodeAssigned)}] 勘定科目割当済み`,
    `  [${mark(checklist.debitCreditBalanced)}] 貸借一致`,
    `  [${mark(checklist.taxConsistent)}] 税率整合`,
    `  [${mark(checklist.approvalQueueSubmitted)}] 承認キュー投入完了`,
  ].join("\n");

export { evaluateChecklist, formatChecklist, isComplete };
