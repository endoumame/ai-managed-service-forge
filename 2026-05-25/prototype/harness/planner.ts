// ハーネス層: 終了条件管理
// AIに「もう完了」と自己申告させず、外部チェックリストで進行を管理する

import type { CompletionChecklist, HarnessContext } from "../types.ts";

const createInitialChecklist = (): CompletionChecklist => ({
  accountCodeValid: false,
  allFieldsExtracted: false,
  amountsConsistent: false,
  journalBalanced: false,
});

const isComplete = (checklist: CompletionChecklist): boolean =>
  checklist.allFieldsExtracted &&
  checklist.amountsConsistent &&
  checklist.accountCodeValid &&
  checklist.journalBalanced;

const getIncompleteItems = (checklist: CompletionChecklist): string[] => {
  const items: string[] = [];
  if (!checklist.allFieldsExtracted) {
    items.push("全必須項目の抽出");
  }
  if (!checklist.amountsConsistent) {
    items.push("金額の整合性確認");
  }
  if (!checklist.accountCodeValid) {
    items.push("勘定科目の妥当性確認");
  }
  if (!checklist.journalBalanced) {
    items.push("仕訳の貸借バランス確認");
  }
  return items;
};

const mark = (val: boolean): string => (val ? "[x]" : "[ ]");

const formatChecklistItems = (cl: CompletionChecklist): string => {
  let report = "=== 終了条件チェックリスト ===\n";
  report += `${mark(cl.allFieldsExtracted)} 全必須項目が抽出されたか\n`;
  report += `${mark(cl.amountsConsistent)} 金額の整合性（小計＋税＝合計）が確認されたか\n`;
  report += `${mark(cl.accountCodeValid)} 勘定科目が有効な科目コードか\n`;
  report += `${mark(cl.journalBalanced)} 仕訳の貸借が一致するか\n`;
  report += `\nステータス: ${isComplete(cl) ? "完了 全条件クリア" : "未完了項目あり"}\n`;
  return report;
};

const formatReviewSection = (ctx: HarnessContext): string => {
  if (!ctx.humanReviewRequired) {
    return "";
  }
  let section = `\nヒューマンレビュー必要:\n`;
  for (const reason of ctx.humanReviewReasons) {
    section += `  - ${reason}\n`;
  }
  return section;
};

const formatChecklistReport = (ctx: HarnessContext): string =>
  formatChecklistItems(ctx.checklist) + formatReviewSection(ctx);

export { createInitialChecklist, isComplete, getIncompleteItems, formatChecklistReport };
