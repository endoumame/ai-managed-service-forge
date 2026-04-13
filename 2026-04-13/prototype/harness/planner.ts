/**
 * ハーネス層 — 終了条件管理（プランナー）
 *
 * なぜ終了条件を外部管理するか:
 * AIエージェントに「もう完了？」と聞くと「はい、完了です」と答えがち（ドリフト問題）。
 * 終了条件はハーネス側のチェックリストで管理し、
 * 各条件を決定論的に検証することで、AIの自己申告に頼らない。
 */

/* eslint-disable no-magic-numbers, max-lines-per-function, max-statements, no-nested-ternary, no-undefined, eqeqeq, no-eq-null, sort-imports, typescript-eslint/strict-boolean-expressions */

import type { ChecklistItem, PipelineState } from "../types/index.js";
import { runAllValidations } from "../deterministic/rules.js";

/**
 * パイプライン用の初期チェックリストを生成する
 * 各項目は外部検証可能な条件として定義
 */
const createChecklist = (): ChecklistItem[] => [
  {
    completed: false,
    id: "input_validated",
    label: "入力データの形式検証が完了",
  },
  {
    completed: false,
    id: "parsed",
    label: "請求書テキストの構造化が完了",
  },
  {
    completed: false,
    id: "classified",
    label: "勘定科目の推定が完了（全明細行に科目割当済み）",
  },
  {
    completed: false,
    id: "balance_verified",
    label: "貸借一致が検証済み",
  },
  {
    completed: false,
    id: "tax_verified",
    label: "消費税額の整合性が検証済み",
  },
  {
    completed: false,
    id: "human_approved",
    label: "人間による承認が完了",
  },
];

/**
 * パイプライン状態に基づいてチェックリストを更新する
 * AIの自己申告ではなく、実際のデータを検証して判定
 */
const updateChecklist = (state: PipelineState): ChecklistItem[] => {
  const checklist = [...state.checklist];

  // 入力検証
  const inputItem = checklist.find((item) => item.id === "input_validated");
  if (inputItem) {
    inputItem.completed = state.input.rawText.trim().length > 0;
    inputItem.detail = inputItem.completed
      ? `${state.input.rawText.length}文字の入力を確認`
      : "入力が空です";
  }

  // 構造化完了
  const parsedItem = checklist.find((item) => item.id === "parsed");
  if (parsedItem) {
    parsedItem.completed =
      Boolean(state.parsed) && state.parsed.lineItems.length > 0 && state.parsed.vendor.length > 0;
    parsedItem.detail = state.parsed ? `${state.parsed.lineItems.length}明細行を解析` : "未解析";
  }

  // 科目推定完了
  const classifiedItem = checklist.find((item) => item.id === "classified");
  if (classifiedItem && state.journal) {
    const allClassified = state.journal.entries.every((entry) => entry.accountCode.length > 0);
    classifiedItem.completed = allClassified;
    classifiedItem.detail = allClassified
      ? `${state.journal.entries.length}仕訳行すべてに科目割当済み`
      : "未割当の科目あり";
  }

  // 貸借一致・税額検証
  if (state.parsed && state.journal) {
    const validation = runAllValidations(state.parsed, state.journal);

    const balanceItem = checklist.find((item) => item.id === "balance_verified");
    if (balanceItem) {
      const balanceErrors = validation.errors.filter(
        (err) => err.field === "balance" && err.severity === "error",
      );
      balanceItem.completed = balanceErrors.length === 0;
      balanceItem.detail = balanceErrors.length === 0 ? "貸借一致" : balanceErrors[0].message;
    }

    const taxItem = checklist.find((item) => item.id === "tax_verified");
    if (taxItem) {
      const taxErrors = validation.errors.filter(
        (err) =>
          (err.field === "taxAmount" || err.field === "totalAmount") && err.severity === "error",
      );
      taxItem.completed = taxErrors.length === 0;
      taxItem.detail = taxErrors.length === 0 ? "税額整合" : taxErrors[0].message;
    }
  }

  // 人間承認
  const approvedItem = checklist.find((item) => item.id === "human_approved");
  if (approvedItem) {
    approvedItem.completed = state.approval === "approved" || state.approval === "modified";
    if (state.approval === "approved") {
      approvedItem.detail = "承認済み";
    } else if (state.approval === "modified") {
      approvedItem.detail = "修正の上で承認済み";
    } else {
      approvedItem.detail = "承認待ち";
    }
  }

  return checklist;
};

/**
 * チェックリストの進捗表示を生成する
 */
const formatChecklistProgress = (checklist: ChecklistItem[]): string => {
  const lines: string[] = [];
  const completed = checklist.filter((item) => item.completed).length;
  lines.push(`\n─── 終了条件チェックリスト [${completed}/${checklist.length}] ───`);

  for (const item of checklist) {
    const icon = item.completed ? "✓" : "○";
    const detail = item.detail ? ` — ${item.detail}` : "";
    lines.push(`  ${icon} ${item.label}${detail}`);
  }

  lines.push("───────────────────────────────────────");
  return lines.join("\n");
};

/**
 * すべての終了条件が満たされているか判定する
 */
const isComplete = (checklist: ChecklistItem[]): boolean =>
  checklist.every((item) => item.completed);

export { createChecklist, formatChecklistProgress, isComplete, updateChecklist };
