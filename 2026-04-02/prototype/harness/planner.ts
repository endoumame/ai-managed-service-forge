/**
 * ハーネス層: 終了条件管理（プランナー）
 *
 * なぜ終了条件を外部管理するか:
 * AIエージェントは「もう十分」と途中完了宣言するドリフト問題がある。
 * 終了条件をチェックリスト形式でハーネスが管理し、
 * 全条件を満たさない限りパイプラインを完了とみなさない。
 * これにより、AIの「自己申告による完了」を防止する。
 */

import type { CompletionChecklist } from "./types.js";

/** 空のチェックリスト（パイプライン開始時の初期状態） */
const createInitialChecklist = (): CompletionChecklist => ({
  accountCodesValid: false,
  allRequiredFieldsExtracted: false,
  anomalyCheckDone: false,
  duplicateCheckDone: false,
  taxCalculationMatches: false,
});

/** チェックリストの進捗をテキストで表示する */
const formatChecklistProgress = (checklist: CompletionChecklist): string => {
  const items = [
    { done: checklist.allRequiredFieldsExtracted, label: "必須フィールド抽出" },
    { done: checklist.accountCodesValid, label: "勘定科目コード検証" },
    { done: checklist.taxCalculationMatches, label: "税額計算一致" },
    { done: checklist.duplicateCheckDone, label: "重複チェック" },
    { done: checklist.anomalyCheckDone, label: "異常値チェック" },
  ];

  const lines = items.map((item) => `  ${item.done ? "[x]" : "[ ]"} ${item.label}`);

  const completed = items.filter((item) => item.done).length;
  const header = `進捗: ${completed}/${items.length}`;

  return [header, ...lines].join("\n");
};

export { createInitialChecklist, formatChecklistProgress };
