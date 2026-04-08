/* eslint-disable typescript/strict-boolean-expressions -- Prototype: nullable field checks */
/**
 * 終了条件管理（プランナー）
 *
 * なぜこの実装か:
 * ドリフト問題の核心は「AIが自分で終了を宣言してしまう」こと。
 * このプランナーは、タスクの終了条件をチェックリストとして外部管理し、
 * AIエージェントには「次に何をすべきか」だけを指示する。
 * 完了判定はすべて決定論的コードが行い、AIの自己申告を受け付けない。
 */

interface CompletionCondition {
  id: string;
  description: string;
  completed: boolean;
  completedAt: string | null;
  validator: () => boolean;
}

interface PipelineState {
  invoiceId: string;
  startedAt: string;
  conditions: CompletionCondition[];
  currentStep: string;
  isComplete: boolean;
}

/** パイプラインの初期状態を生成する */
const createPipelineState = (invoiceId: string): PipelineState => ({
  conditions: [
    {
      completed: false,
      completedAt: null,
      description: "入力データが前処理チェックを通過した",
      id: "input_validated",
      validator: (): boolean => false,
    },
    {
      completed: false,
      completedAt: null,
      description: "請求書から全必須フィールドが抽出された",
      id: "data_extracted",
      validator: (): boolean => false,
    },
    {
      completed: false,
      completedAt: null,
      description: "抽出データのバリデーションが通過した",
      id: "extraction_validated",
      validator: (): boolean => false,
    },
    {
      completed: false,
      completedAt: null,
      description: "仕訳が正しく生成された",
      id: "journal_entry_created",
      validator: (): boolean => false,
    },
    {
      completed: false,
      completedAt: null,
      description: "仕訳のバリデーション（借方貸方一致等）が通過した",
      id: "journal_validated",
      validator: (): boolean => false,
    },
    {
      completed: false,
      completedAt: null,
      description: "人間が確認・承認した",
      id: "human_reviewed",
      validator: (): boolean => false,
    },
  ],
  currentStep: "input_validated",
  invoiceId,
  isComplete: false,
  startedAt: new Date().toISOString(),
});

/** 条件を完了状態に更新する（バリデータが true を返した場合のみ） */
const markConditionComplete = (
  state: PipelineState,
  conditionId: string,
  validatorResult: boolean,
): PipelineState => {
  const updatedConditions = state.conditions.map((cond) => {
    if (cond.id === conditionId && validatorResult) {
      return { ...cond, completed: true, completedAt: new Date().toISOString() };
    }
    return cond;
  });

  const nextIncomplete = updatedConditions.find((cond) => !cond.completed);
  const allComplete = updatedConditions.every((cond) => cond.completed);

  return {
    ...state,
    conditions: updatedConditions,
    currentStep: nextIncomplete?.id ?? "complete",
    isComplete: allComplete,
  };
};

const TIME_SLICE_START = 0;
const TIME_PART_INDEX = 1;
const TIME_SLICE_END = 8;
const PERCENTAGE_MULTIPLIER = 100;

const formatConditionLine = (condition: CompletionCondition, currentStep: string): string => {
  let icon = "[ ]";
  if (condition.completed) {
    icon = "[v]";
  } else if (condition.id === currentStep) {
    icon = "[>]";
  }
  const time = condition.completedAt
    ? ` (${condition.completedAt.split("T")[TIME_PART_INDEX]?.slice(TIME_SLICE_START, TIME_SLICE_END)})`
    : "";
  return `  ${icon} ${condition.description}${time}`;
};

const formatProgressFooter = (state: PipelineState): string[] => {
  const progress = state.conditions.filter((cond) => cond.completed).length;
  const total = state.conditions.length;
  const pct = Math.round((progress / total) * PERCENTAGE_MULTIPLIER);
  return [
    "-------------------------------------------",
    `  進捗: ${progress}/${total} (${pct}%)`,
    `  状態: ${state.isComplete ? "完了" : `処理中 -> ${state.currentStep}`}`,
    "-------------------------------------------",
  ];
};

/** 現在のパイプライン状態を人間が読みやすい形式でフォーマットする */
const formatPipelineStatus = (state: PipelineState): string => {
  const header = [
    "-------------------------------------------",
    `  パイプライン状態: ${state.invoiceId}`,
    `  開始: ${state.startedAt}`,
    "-------------------------------------------",
  ];
  const conditionLines = state.conditions.map((cond) =>
    formatConditionLine(cond, state.currentStep),
  );
  return [...header, ...conditionLines, ...formatProgressFooter(state)].join("\n");
};

/** パイプラインの次のアクションを決定する（AIに判断させない） */
const getNextAction = (state: PipelineState): { action: string; conditionId: string } | null => {
  if (state.isComplete) {
    return null;
  }

  const nextCondition = state.conditions.find((cond) => !cond.completed);
  if (!nextCondition) {
    return null;
  }

  const actionMap: Record<string, string> = {
    data_extracted: "AIエージェントで請求書データを抽出してください",
    extraction_validated: "抽出結果のバリデーションを実行してください",
    human_reviewed: "人間の確認・承認を取得してください",
    input_validated: "入力データの前処理チェックを実行してください",
    journal_entry_created: "仕訳を生成してください",
    journal_validated: "仕訳のバリデーションを実行してください",
  };

  return {
    action: actionMap[nextCondition.id] ?? "次のステップを実行してください",
    conditionId: nextCondition.id,
  };
};

export { createPipelineState, formatPipelineStatus, getNextAction, markConditionComplete };
export type { CompletionCondition, PipelineState };
