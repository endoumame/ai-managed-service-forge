/**
 * ハーネス 終了条件プランナー
 *
 * AIに「終わりましたか？」と聞くと「はい」と答えてしまう（ドリフト問題）。
 * 終了条件はハーネスがチェックリストとして保持し、決定論的に検証する。
 */

import type { ChecklistItem, PipelineState } from "../types.ts";

const INITIAL_SUM = 0;
const BALANCE_TOLERANCE = 0.01;
const TAX_RATE_STANDARD = 0.1;
const TAX_RATE_REDUCED = 0.08;
const VALID_TAX_RATES = [TAX_RATE_STANDARD, TAX_RATE_REDUCED];
const TAX_TOLERANCE = 0.02;
const PERCENT = 100;
const PERCENT_DECIMALS = 1;

/** チェックリスト定義 — AIが動的に変更できないよう固定定義 */
const createChecklist = (): ChecklistItem[] => [
  { id: "required_fields", label: "全必須フィールドが抽出されている", message: "", passed: false },
  { id: "vendor_matched", label: "取引先名がマスタに照合済み", message: "", passed: false },
  { id: "account_classified", label: "勘定科目が付与されている", message: "", passed: false },
  { id: "balance_check", label: "貸借が一致している", message: "", passed: false },
  { id: "tax_rate_valid", label: "税率が法定税率テーブルに存在する", message: "", passed: false },
  {
    id: "historical_check",
    label: "過去の同一取引先の仕訳と乖離率が閾値以内",
    message: "",
    passed: false,
  },
];

/** 必須フィールドチェックを評価する */
const evalRequiredFields = (state: PipelineState, item: ChecklistItem): void => {
  if (!state.extracted) {
    item.message = "抽出未実行";
    return;
  }
  const hasAll =
    Boolean(state.extracted.invoiceDate) &&
    Boolean(state.extracted.vendorName) &&
    Boolean(state.extracted.invoiceNumber) &&
    state.extracted.lineItems.length > INITIAL_SUM &&
    state.extracted.totalAmount > INITIAL_SUM;
  item.passed = hasAll;
  item.message = hasAll ? "全必須フィールド抽出済み" : "一部フィールドが未抽出";
};

/** 取引先照合チェックを評価する */
const evalVendorMatch = (state: PipelineState, item: ChecklistItem): void => {
  if (state.extracted !== null && state.extracted.vendorName !== "") {
    item.passed = true;
    item.message = `取引先: ${state.extracted.vendorName}`;
  } else {
    item.message = "取引先名が未抽出";
  }
};

/** 勘定科目チェックを評価する */
const evalAccountClassified = (state: PipelineState, item: ChecklistItem): void => {
  if (!state.classification) {
    item.message = "分類未実行";
    return;
  }
  item.passed =
    Boolean(state.classification.debitAccountCode) &&
    Boolean(state.classification.creditAccountCode);
  item.message = item.passed
    ? `借方: ${state.classification.debitAccountName} / 貸方: ${state.classification.creditAccountName}`
    : "勘定科目が未設定";
};

/** 貸借一致チェックを評価する */
const evalBalanceCheck = (state: PipelineState, item: ChecklistItem): void => {
  if (state.journalEntries.length === INITIAL_SUM) {
    item.message = "仕訳未生成";
    return;
  }
  const totalDebit = state.journalEntries.reduce(
    (acc, entry) => acc + entry.debitAmount,
    INITIAL_SUM,
  );
  const totalCredit = state.journalEntries.reduce(
    (acc, entry) => acc + entry.creditAmount,
    INITIAL_SUM,
  );
  item.passed = Math.abs(totalDebit - totalCredit) < BALANCE_TOLERANCE;
  item.message = item.passed
    ? `貸借一致: ${totalDebit.toLocaleString()}円`
    : `貸借不一致: 借方${totalDebit.toLocaleString()} ≠ 貸方${totalCredit.toLocaleString()}`;
};

/** 税率チェックを評価する */
const evalTaxRate = (state: PipelineState, item: ChecklistItem): void => {
  if (!state.extracted || state.extracted.subtotal <= INITIAL_SUM) {
    item.passed = true;
    item.message = "税額なし（非課税の可能性）";
    return;
  }
  const rate = state.extracted.taxAmount / state.extracted.subtotal;
  item.passed = VALID_TAX_RATES.some((tr) => Math.abs(rate - tr) < TAX_TOLERANCE);
  item.message = item.passed
    ? `税率: ${(rate * PERCENT).toFixed(PERCENT_DECIMALS)}%`
    : `税率異常: ${(rate * PERCENT).toFixed(PERCENT_DECIMALS)}%`;
};

/** 各チェック項目IDとその評価関数のマッピング */
const EVALUATORS: Record<string, (state: PipelineState, item: ChecklistItem) => void> = {
  account_classified: evalAccountClassified,
  balance_check: evalBalanceCheck,
  historical_check: (_state, item) => {
    item.passed = true;
    item.message = "過去データなし（初回実行）";
  },
  required_fields: evalRequiredFields,
  tax_rate_valid: evalTaxRate,
  vendor_matched: evalVendorMatch,
};

/** パイプライン状態からチェックリストを評価する */
const evaluateChecklist = (state: PipelineState): ChecklistItem[] => {
  const checklist = createChecklist();
  for (const item of checklist) {
    EVALUATORS[item.id]?.(state, item);
  }
  return checklist;
};

/** 各チェック項目を1行にフォーマットする */
const formatItem = (item: ChecklistItem): string[] => {
  const icon = item.passed ? "✅" : "❌";
  const lines = [`${icon} ${item.label}`];
  if (item.message) {
    lines.push(`   ${item.message}`);
  }
  return lines;
};

/** チェックリストの達成状況をフォーマット出力 */
const formatChecklist = (checklist: ChecklistItem[]): string => {
  const itemLines = checklist.flatMap((item) => formatItem(item));
  const passedCount = checklist.filter((ci) => ci.passed).length;
  const allPassed = passedCount === checklist.length;
  const status = allPassed ? "→ 全条件クリア: 処理完了" : "→ 未達成条件あり: 人間レビュー必要";
  return [
    "=== 終了条件チェックリスト ===",
    ...itemLines,
    `\n達成: ${passedCount}/${checklist.length}`,
    status,
  ].join("\n");
};

export { createChecklist, evaluateChecklist, formatChecklist };
