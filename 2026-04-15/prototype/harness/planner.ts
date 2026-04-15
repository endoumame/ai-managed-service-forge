/**
 * ハーネス層 — 終了条件管理（プランナー）
 *
 * なぜこの実装か:
 * AIエージェントに「完了したか？」を自己判断させると、
 * ドリフト問題（途中完了宣言、品質の自己過信）が発生する。
 * チェックリスト方式で終了条件を外部管理し、
 * 全条件が満たされるまでパイプラインを完了としない。
 */

import type { ChecklistItem, ProcessingRecord } from "../types.js";

/**
 * 処理バッチに対するチェックリストを生成する。
 * 各条件はハーネスが客観的に検証可能なものだけで構成される。
 */
const createChecklist = (): ChecklistItem[] => [
  {
    checkedAt: null,
    description: "全請求書がAI分類済みであること",
    id: "all-classified",
    passed: false,
  },
  {
    checkedAt: null,
    description: "全仕訳がバリデーションを通過していること",
    id: "all-validated",
    passed: false,
  },
  {
    checkedAt: null,
    description: "全仕訳が承認済み/修正済みであること",
    id: "all-resolved",
    passed: false,
  },
];

/**
 * 全請求書が分類済みかチェックする。
 */
const checkAllClassified = (records: ProcessingRecord[]): boolean =>
  records.every((rec) => rec.classification !== null);

/**
 * 全仕訳がバリデーション通過済みかチェックする。
 */
const checkAllValidated = (records: ProcessingRecord[]): boolean =>
  records.every((rec) => rec.validation !== null && rec.validation.valid);

/**
 * 全仕訳が最終状態（承認/修正）に到達しているかチェックする。
 */
const checkAllResolved = (records: ProcessingRecord[]): boolean =>
  records.every(
    (rec) => rec.status === "approved" || rec.status === "corrected" || rec.status === "rejected",
  );

interface ChecklistEvaluation {
  checklist: ChecklistItem[];
  allPassed: boolean;
}

/**
 * チェックリストを現在の処理状態で評価する。
 * AIの自己申告ではなく、実データに基づいて客観的に判定する。
 */
const evaluateChecklist = (records: ProcessingRecord[]): ChecklistEvaluation => {
  const now = new Date().toISOString();
  const classifiedPassed = checkAllClassified(records);
  const validatedPassed = checkAllValidated(records);
  const resolvedPassed = checkAllResolved(records);

  const checklist: ChecklistItem[] = [
    {
      checkedAt: now,
      description: "全請求書がAI分類済みであること",
      id: "all-classified",
      passed: classifiedPassed,
    },
    {
      checkedAt: now,
      description: "全仕訳がバリデーションを通過していること",
      id: "all-validated",
      passed: validatedPassed,
    },
    {
      checkedAt: now,
      description: "全仕訳が承認済み/修正済みであること",
      id: "all-resolved",
      passed: resolvedPassed,
    },
  ];

  return {
    allPassed: classifiedPassed && validatedPassed && resolvedPassed,
    checklist,
  };
};

export { createChecklist, evaluateChecklist };
export type { ChecklistEvaluation };
