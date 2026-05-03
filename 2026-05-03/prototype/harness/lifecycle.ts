// ハーネスのライフサイクルフック定義
// 各処理ステップのbefore/afterに挟まる外部バリデーション

import type {
  CheckStatus,
  ExtractedData,
  InvoiceChecklist,
  JournalEntry,
  RawInvoice,
} from "../types.ts";
import { updateChecklistItem } from "./planner.ts";

interface HookResult {
  passed: boolean;
  message: string;
}

interface LifecycleHooks {
  beforeExtraction: (invoice: RawInvoice) => HookResult;
  afterExtraction: (extracted: ExtractedData) => HookResult;
  afterJournalEntry: (journal: JournalEntry) => HookResult;
}

const ZERO = 0;

interface FieldCheck {
  label: string;
  valid: boolean;
}

const evaluateChecks = (checks: FieldCheck[], passMsg: string, failPrefix: string): HookResult => {
  const failing = checks.filter((ch) => !ch.valid).map((ch) => ch.label);
  const passed = failing.length === ZERO;
  const message = passed ? passMsg : `${failPrefix}: ${failing.join(", ")}`;
  return { message, passed };
};

const beforeExtraction = (invoice: RawInvoice): HookResult =>
  evaluateChecks(
    [
      { label: "items", valid: invoice.items.length > ZERO },
      { label: "vendor", valid: invoice.vendor.length > ZERO },
      { label: "totalAmount", valid: invoice.totalAmount > ZERO },
    ],
    "入力バリデーション通過",
    "必須フィールド不足",
  );

const afterExtraction = (extracted: ExtractedData): HookResult =>
  evaluateChecks(
    [
      { label: "vendorName", valid: extracted.vendorName.length > ZERO },
      { label: "invoiceNumber", valid: extracted.invoiceNumber.length > ZERO },
      { label: "issueDate", valid: extracted.issueDate.length > ZERO },
      { label: "totalAmount", valid: extracted.totalAmount > ZERO },
    ],
    "抽出データ完全性チェック通過",
    "抽出データ不完全",
  );

const afterJournalEntry = (journal: JournalEntry): HookResult =>
  evaluateChecks(
    [
      { label: "仕訳行なし", valid: journal.entries.length > ZERO },
      { label: "借方なし", valid: journal.entries.some((entry) => entry.side === "debit") },
      { label: "貸方なし", valid: journal.entries.some((entry) => entry.side === "credit") },
    ],
    "仕訳構造チェック通過",
    "仕訳構造不正",
  );

const createHooks = (): LifecycleHooks => ({
  afterExtraction,
  afterJournalEntry,
  beforeExtraction,
});

const applyHookToChecklist = (
  checklist: InvoiceChecklist,
  result: HookResult,
  stepId: string,
): InvoiceChecklist =>
  updateChecklistItem(checklist, {
    message: result.message,
    status: (result.passed ? "passed" : "failed") as CheckStatus,
    stepId,
  });

export { type HookResult, type LifecycleHooks, applyHookToChecklist, createHooks };
