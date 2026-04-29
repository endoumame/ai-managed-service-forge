import type {
  CompletionChecklist,
  ExtractedData,
  JournalEntry,
  ValidationResult,
} from "../types.ts";
import { validateDebitCreditBalance, validateNumericIntegrity } from "../deterministic/rules.ts";

const SUM_INITIAL = 0;

const createChecklist = (): CompletionChecklist => ({
  allInvoicesExtracted: false,
  allJournalsAssigned: false,
  debitCreditBalanced: false,
  highRiskFlagged: false,
  noNumericDiscrepancies: false,
});

const beforeExtraction = (invoiceData: Record<string, unknown>): ValidationResult => {
  const hasId = typeof invoiceData.id === "string" && invoiceData.id.length > SUM_INITIAL;
  const hasVendor =
    typeof invoiceData.vendor === "string" && invoiceData.vendor.length > SUM_INITIAL;
  const hasItems = Array.isArray(invoiceData.items) && invoiceData.items.length > SUM_INITIAL;
  return {
    checks: [
      { message: hasId ? "OK" : "NG: 請求書IDが未設定", name: "請求書ID", passed: hasId },
      { message: hasVendor ? "OK" : "NG: 取引先名が未設定", name: "取引先名", passed: hasVendor },
      { message: hasItems ? "OK" : "NG: 明細行が空", name: "明細行", passed: hasItems },
    ],
    passed: hasId && hasVendor && hasItems,
  };
};

const afterExtraction = (extracted: ExtractedData): ValidationResult =>
  validateNumericIntegrity(extracted);

const afterJournalEntry = (entry: JournalEntry): ValidationResult =>
  validateDebitCreditBalance(entry);

const isComplete = (checklist: CompletionChecklist): boolean =>
  Object.values(checklist).every(Boolean);

const printChecklist = (checklist: CompletionChecklist): string => {
  const entries: [string, boolean][] = [
    ["全請求書の抽出完了", checklist.allInvoicesExtracted],
    ["数値不整合ゼロ", checklist.noNumericDiscrepancies],
    ["全仕訳に科目割当済", checklist.allJournalsAssigned],
    ["貸借差額ゼロ", checklist.debitCreditBalanced],
    ["高リスク案件フラグ済", checklist.highRiskFlagged],
  ];
  return entries.map(([label, done]) => `  ${done ? "[x]" : "[ ]"} ${label}`).join("\n");
};

export {
  createChecklist,
  beforeExtraction,
  afterExtraction,
  afterJournalEntry,
  isComplete,
  printChecklist,
};
