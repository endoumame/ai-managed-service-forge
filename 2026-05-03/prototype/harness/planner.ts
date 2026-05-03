// ハーネスの終了条件管理
// AIの自己申告ではなく、外部チェックリストで完了状態を判定する

import type { CheckStatus, ChecklistItem, InvoiceChecklist } from "../types.ts";

const REQUIRED_STEPS = [
  { id: "extraction", name: "データ抽出完了" },
  { id: "extraction_quality", name: "抽出品質チェック通過" },
  { id: "journal_generated", name: "仕訳生成完了" },
  { id: "journal_balanced", name: "借貸バランスチェック通過" },
  { id: "amount_reconciled", name: "金額突合チェック通過" },
  { id: "approval_routed", name: "承認ルーティング完了" },
] as const;

const createChecklist = (invoiceId: string): InvoiceChecklist => ({
  invoiceId,
  items: REQUIRED_STEPS.map((step) => ({
    id: step.id,
    name: step.name,
    status: "pending" as CheckStatus,
  })),
});

interface ChecklistUpdate {
  stepId: string;
  status: CheckStatus;
  message?: string;
}

const updateChecklistItem = (
  checklist: InvoiceChecklist,
  update: ChecklistUpdate,
): InvoiceChecklist => ({
  ...checklist,
  items: checklist.items.map((item) =>
    item.id === update.stepId
      ? {
          ...item,
          message: update.message,
          status: update.status,
          timestamp: new Date().toISOString(),
        }
      : item,
  ),
});

const isComplete = (checklist: InvoiceChecklist): boolean =>
  checklist.items.every((item) => item.status === "passed" || item.status === "skipped");

const hasFailed = (checklist: InvoiceChecklist): boolean =>
  checklist.items.some((item) => item.status === "failed");

const getPendingSteps = (checklist: InvoiceChecklist): ChecklistItem[] =>
  checklist.items.filter((item) => item.status === "pending");

const STATUS_ICONS: Record<CheckStatus, string> = {
  failed: "[!]",
  passed: "[x]",
  pending: "[ ]",
  skipped: "[-]",
};

const formatChecklist = (checklist: InvoiceChecklist): string => {
  const lines = checklist.items.map((item) => {
    const icon = STATUS_ICONS[item.status];
    const msg = typeof item.message === "string" && item.message !== "" ? ` (${item.message})` : "";
    return `  ${icon} ${item.name}${msg}`;
  });
  return `Checklist for ${checklist.invoiceId}:\n${lines.join("\n")}`;
};

export {
  createChecklist,
  formatChecklist,
  getPendingSteps,
  hasFailed,
  isComplete,
  updateChecklistItem,
};
