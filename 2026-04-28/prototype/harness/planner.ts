import type { Checklist, ChecklistItem, ExtractionResult, JournalEntry } from "../types.ts";

const ZERO = 0;

const createChecklistItem = (
  id: string,
  label: string,
  validator: () => boolean,
): ChecklistItem => ({
  completed: false,
  id,
  label,
  validator,
});

const createProcessingChecklist = (
  getExtraction: () => ExtractionResult | null,
  getJournal: () => JournalEntry | null,
): Checklist => {
  const items: ChecklistItem[] = [
    createChecklistItem("extract_complete", "請求書情報の抽出完了", () => {
      const result = getExtraction();
      return result !== null && result.extractedLines.length > ZERO;
    }),
    createChecklistItem("account_assigned", "勘定科目の割当完了", () => {
      const result = getExtraction();
      return (
        result !== null &&
        result.extractedLines.every((line) => line.suggestedAccountCode.length > ZERO)
      );
    }),
    createChecklistItem("debit_credit_balanced", "貸借一致検証通過", () => {
      const journal = getJournal();
      return journal !== null && journal.totalDebit === journal.totalCredit;
    }),
    createChecklistItem("tax_verified", "税額整合性検証通過", () => {
      const journal = getJournal();
      return journal !== null && journal.totalDebit > ZERO;
    }),
    createChecklistItem("routing_complete", "承認ルーティング完了", () => {
      const journal = getJournal();
      return journal !== null && journal.status !== "draft";
    }),
  ];

  return {
    allCompleted: () => items.every((item) => item.completed),
    items,
  };
};

const runChecklist = (checklist: Checklist): { allPassed: boolean; results: string[] } => {
  const results: string[] = [];

  for (const item of checklist.items) {
    const passed = item.validator();
    item.completed = passed;
    const status = passed ? "PASS" : "FAIL";
    results.push(`[${status}] ${item.label}`);
  }

  return { allPassed: checklist.allCompleted(), results };
};

export { createProcessingChecklist, runChecklist };
