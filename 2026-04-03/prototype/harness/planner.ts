/**
 * ハーネス層 — 終了条件管理（プランナー）
 *
 * なぜ「プランナー」と呼ぶか:
 * AIエージェントに「いつ終わるか」を自己判断させない。
 * プランナーが外部から「まだ終わっていない」「もう終わってよい」を制御する。
 * これがドリフト問題の最も効果的な対策。
 */

import type { CompletionChecklist } from "../types.ts";

/**
 * 終了条件チェックリストを表示用テキストに変換する
 */
const formatChecklist = (checklist: CompletionChecklist): string => {
  const items = [
    {
      label: "全入金データが処理済み",
      passed: checklist.allDepositsProcessed,
    },
    {
      label: "金額整合性チェック通過",
      passed: checklist.amountIntegrityPassed,
    },
    { label: "二重マッチングなし", passed: checklist.noDuplicateMatches },
    {
      label: "全候補に信頼度スコア付与済み",
      passed: checklist.allCandidatesScored,
    },
  ];

  const lines = items.map((item) => `  ${item.passed ? "[x]" : "[ ]"} ${item.label}`);

  const allPassed = items.every((item) => item.passed);
  const header = allPassed ? "=== 終了条件: 全て充足 ===" : "=== 終了条件: 未充足あり ===";

  return [header, ...lines].join("\n");
};

/**
 * 全ての終了条件が満たされているか判定する
 */
const isComplete = (checklist: CompletionChecklist): boolean =>
  checklist.allDepositsProcessed &&
  checklist.amountIntegrityPassed &&
  checklist.noDuplicateMatches &&
  checklist.allCandidatesScored;

export { formatChecklist, isComplete };
