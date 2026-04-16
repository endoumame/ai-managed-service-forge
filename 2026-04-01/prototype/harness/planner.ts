/**
 * 終了条件管理（プランナー）
 *
 * なぜこの実装か:
 * ドリフト問題の核心は「AIが自分で完了を宣言してしまう」こと。
 * このプランナーはチェックリスト形式で終了条件を外部管理し、
 * すべての条件がパスしない限り処理を完了させない。
 *
 * AIに「もう十分ですか？」と聞くのではなく、
 * ハーネスが「まだ条件を満たしていません」と制御する。
 */

const EMPTY_COUNT = 0;

interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
  completedAt?: Date;
  detail?: string;
}

interface ProcessingPlan {
  invoiceId: string;
  checklist: ChecklistItem[];
  startedAt: Date;
  completedAt?: Date;
}

/**
 * 請求書処理の終了条件チェックリストを生成
 * すべての条件は初期状態でfalse
 */
const createProcessingPlan = (invoiceId: string): ProcessingPlan => ({
  checklist: [
    { completed: false, id: "input_validated", label: "入力データが検証済み" },
    { completed: false, id: "fields_extracted", label: "全必須フィールドが抽出済み" },
    { completed: false, id: "extraction_quality_passed", label: "抽出品質チェックがパス" },
    { completed: false, id: "account_classified", label: "仕訳科目が確定済み（自動 or 人間承認）" },
    { completed: false, id: "amount_integrity_passed", label: "金額整合性チェックがパス" },
    { completed: false, id: "human_review_completed", label: "人間レビューが完了（必要な場合）" },
    { completed: false, id: "output_validated", label: "出力フォーマット検証がパス" },
  ],
  invoiceId,
  startedAt: new Date(),
});

/**
 * チェックリストの項目を完了にする
 */
const completeChecklistItem = (plan: ProcessingPlan, itemId: string, detail?: string): boolean => {
  const item = plan.checklist.find((ci) => ci.id === itemId);
  if (!item) {
    return false;
  }

  item.completed = true;
  item.completedAt = new Date();
  if (typeof detail === "string" && detail.length > EMPTY_COUNT) {
    item.detail = detail;
  }

  return true;
};

/**
 * 全条件が完了しているかチェック
 * AIの自己申告ではなく、このメソッドの結果のみが「完了」の判断基準
 */
const isProcessingComplete = (plan: ProcessingPlan): boolean =>
  plan.checklist.every((item) => item.completed);

/**
 * 未完了の条件一覧を取得
 */
const getPendingItems = (plan: ProcessingPlan): ChecklistItem[] =>
  plan.checklist.filter((item) => !item.completed);

/**
 * チェックリストの進捗状況を表示用文字列で返す
 */
const SEPARATOR_WIDTH = 40;

const formatProgress = (plan: ProcessingPlan): string => {
  const total = plan.checklist.length;
  const completed = plan.checklist.filter((ci) => ci.completed).length;
  const lines = plan.checklist.map(
    (item) =>
      `  ${item.completed ? "[x]" : "[ ]"} ${item.label}${typeof item.detail === "string" ? ` (${item.detail})` : ""}`,
  );

  return [
    `Processing Progress: ${completed}/${total}`,
    `Invoice ID: ${plan.invoiceId}`,
    "-".repeat(SEPARATOR_WIDTH),
    ...lines,
    "-".repeat(SEPARATOR_WIDTH),
  ].join("\n");
};

export {
  completeChecklistItem,
  createProcessingPlan,
  formatProgress,
  getPendingItems,
  isProcessingComplete,
};
export type { ChecklistItem, ProcessingPlan };
