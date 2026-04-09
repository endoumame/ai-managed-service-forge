/**
 * ハーネス層: 品質チェック & 終了条件管理
 *
 * AIに「完了しましたか？」と自己申告させるのではなく、
 * 外部のチェックリストで客観的に完了を判定する。
 * これがドリフト問題（終了条件の誤認）への構造的対策。
 */

import type {
  AccountClassification,
  ChecklistItem,
  CompletionChecklist,
  ExtractedInvoice,
  JournalEntry,
  KnowledgeEntry,
  ProcessedInvoiceRecord,
} from "../types.ts";

/** 金額比較の許容誤差（浮動小数点対策で1円未満の差を許容） */
const AMOUNT_TOLERANCE = 1;

/** Reduce の初期値 */
const SUM_INITIAL = 0;

interface DuplicateCheckInput {
  invoiceNumber: string;
  vendorName: string;
  totalAmount: number;
  knowledge: KnowledgeEntry;
}

const collectMissingFields = (extracted: ExtractedInvoice): string[] => {
  const checks: [boolean, string][] = [
    [!extracted.vendorName, "取引先名"],
    [!extracted.invoiceNumber, "請求書番号"],
    [!extracted.invoiceDate, "日付"],
    [!extracted.lineItems?.length, "明細"],
  ];
  return checks.filter(([isMissing]) => isMissing).map(([, label]) => label);
};

const checkRequiredFieldsExtracted = (extracted: ExtractedInvoice | null): ChecklistItem => {
  if (!extracted) {
    return {
      detail: "抽出未実行",
      id: "required_fields",
      label: "全必須項目の抽出完了",
      passed: false,
    };
  }
  const missing = collectMissingFields(extracted);
  const hasMissing = missing.length !== SUM_INITIAL;
  return {
    detail: hasMissing ? `未抽出: ${missing.join(", ")}` : "OK",
    id: "required_fields",
    label: "全必須項目の抽出完了",
    passed: !hasMissing,
  };
};

const checkAmountConsistency = (extracted: ExtractedInvoice | null): ChecklistItem => {
  if (extracted === null || extracted.lineItems.length === SUM_INITIAL) {
    return {
      detail: "明細データなし",
      id: "amount_consistency",
      label: "金額整合性チェックOK",
      passed: false,
    };
  }

  const lineTotal = extracted.lineItems.reduce((sum, item) => sum + item.amount, SUM_INITIAL);
  const expectedTotal = lineTotal + extracted.taxAmount;
  const passed = Math.abs(expectedTotal - extracted.totalAmount) < AMOUNT_TOLERANCE;

  return {
    detail: passed
      ? `明細合計(${lineTotal}) + 税額(${extracted.taxAmount}) = ${expectedTotal}`
      : `不一致: ${expectedTotal} ≠ ${extracted.totalAmount}`,
    id: "amount_consistency",
    label: "金額整合性チェックOK",
    passed,
  };
};

const checkAccountDetermined = (classification: AccountClassification | null): ChecklistItem => ({
  detail: classification
    ? `${classification.accountCode}: ${classification.accountName}`
    : "未分類",
  id: "account_determined",
  label: "勘定科目の確定",
  passed: classification !== null && classification.accountCode !== "",
});

const checkJournalEntryGenerated = (entry: JournalEntry | null): ChecklistItem => ({
  detail: entry ? `${entry.debitAccount} / ${entry.creditAccount}` : "未生成",
  id: "journal_generated",
  label: "仕訳データの生成完了",
  passed: entry !== null,
});

const checkDebitCreditBalance = (entry: JournalEntry | null): ChecklistItem => {
  if (!entry) {
    return {
      detail: "仕訳未生成",
      id: "debit_credit_balance",
      label: "借方・貸方の一致確認",
      passed: false,
    };
  }
  const balanced = Math.abs(entry.debitAmount - entry.creditAmount) < AMOUNT_TOLERANCE;
  return {
    detail: balanced
      ? `借方=${entry.debitAmount}, 貸方=${entry.creditAmount}`
      : `不一致: 借方${entry.debitAmount} ≠ 貸方${entry.creditAmount}`,
    id: "debit_credit_balance",
    label: "借方・貸方の一致確認",
    passed: balanced,
  };
};

/** 終了条件チェックリストを構築・評価する */
const buildCompletionChecklist = (
  extracted: ExtractedInvoice | null,
  classification: AccountClassification | null,
  journalEntry: JournalEntry | null,
): CompletionChecklist => {
  const items: ChecklistItem[] = [
    checkRequiredFieldsExtracted(extracted),
    checkAmountConsistency(extracted),
    checkAccountDetermined(classification),
    checkJournalEntryGenerated(journalEntry),
    checkDebitCreditBalance(journalEntry),
  ];

  const allPassed = items.every((item) => item.passed);
  const failures = items.filter((item) => !item.passed);
  const failureSummary =
    failures.length === SUM_INITIAL
      ? null
      : `未達成項目: ${failures.map((failure) => failure.label).join(", ")}`;

  return { allPassed, ...(failureSummary === null ? {} : { failureSummary }), items };
};

/** 重複請求書チェック（決定論的: 完全一致のみ検知） */
const checkDuplicateInvoice = (
  input: DuplicateCheckInput,
): { isDuplicate: boolean; matchedRecord?: ProcessedInvoiceRecord } => {
  const match = input.knowledge.processedInvoices.find(
    (record) =>
      record.invoiceNumber === input.invoiceNumber &&
      record.vendorName === input.vendorName &&
      Math.abs(record.totalAmount - input.totalAmount) < AMOUNT_TOLERANCE,
  );
  return { isDuplicate: Boolean(match), matchedRecord: match };
};

export { buildCompletionChecklist, checkDuplicateInvoice };
export type { DuplicateCheckInput };
