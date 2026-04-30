import type { CompletionChecklist } from "../types.js";

const createChecklist = (transactionId: string): CompletionChecklist => ({
  accountValidated: false,
  balanceChecked: false,
  extracted: false,
  journalGenerated: false,
  routed: false,
  taxVerified: false,
  transactionId,
});

const isComplete = (checklist: CompletionChecklist): boolean =>
  checklist.extracted &&
  checklist.journalGenerated &&
  checklist.balanceChecked &&
  checklist.accountValidated &&
  checklist.taxVerified &&
  checklist.routed;

const CHECKLIST_STEP_MAP: {
  key: keyof Omit<CompletionChecklist, "transactionId">;
  label: string;
}[] = [
  { key: "extracted", label: "取引データ抽出" },
  { key: "journalGenerated", label: "仕訳候補生成" },
  { key: "balanceChecked", label: "借貸バランスチェック" },
  { key: "accountValidated", label: "勘定科目マスタ照合" },
  { key: "taxVerified", label: "税区分検証" },
  { key: "routed", label: "承認ルーティング" },
];

const getPendingSteps = (checklist: CompletionChecklist): string[] =>
  CHECKLIST_STEP_MAP.filter((step) => !checklist[step.key]).map((step) => step.label);

const formatProgress = (checklist: CompletionChecklist): string =>
  CHECKLIST_STEP_MAP.map((step) => `[${checklist[step.key] ? "x" : " "}] ${step.label}`).join("\n");

export { createChecklist, formatProgress, getPendingSteps, isComplete };
