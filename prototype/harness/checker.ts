/*
 * ハーネス層: 品質チェック（終了条件の外部管理）
 *
 * AIに「終了しましたか？」と聞くのではなく、
 * チェックリスト形式で客観的に完了を判定する。
 * これがドリフト問題への根本的な解決策。
 */

import type { CheckResult, ChecklistItem, PipelineContext } from "../types.ts";

const EMPTY = 0;
const FLOAT_TOLERANCE = 0.01;

const VALID_ACCOUNTS = new Set([
  "仕入高",
  "消耗品費",
  "通信費",
  "広告宣伝費",
  "旅費交通費",
  "接待交際費",
  "地代家賃",
  "水道光熱費",
  "支払手数料",
  "外注費",
  "雑費",
  "仮払消費税",
  "買掛金",
  "未払金",
]);

/** 全必須項目が抽出されているかチェック */
const checkExtractionComplete = (ctx: PipelineContext): CheckResult => {
  if (!ctx.extractedData) {
    return { message: "抽出データが未生成", passed: false, severity: "error" };
  }
  const hasAllFields =
    ctx.extractedData.vendor !== "" &&
    ctx.extractedData.invoiceNumber !== "" &&
    ctx.extractedData.date !== "" &&
    ctx.extractedData.items.length > EMPTY;
  return {
    message: hasAllFields ? "全必須項目が抽出済み" : "必須項目に欠損あり",
    passed: hasAllFields,
    severity: hasAllFields ? "info" : "error",
  };
};

/** 勘定科目がマスターに存在するかチェック */
const checkAccountsValid = (ctx: PipelineContext): CheckResult => {
  if (!ctx.journalEntry) {
    return { message: "仕訳データが未生成", passed: false, severity: "error" };
  }
  const invalidAccounts = ctx.journalEntry.entries
    .map((entry) => entry.account)
    .filter((acc) => !VALID_ACCOUNTS.has(acc));
  return {
    message:
      invalidAccounts.length === EMPTY
        ? "全勘定科目がマスターに存在"
        : `不明な勘定科目: ${invalidAccounts.join(", ")}`,
    passed: invalidAccounts.length === EMPTY,
    severity: invalidAccounts.length === EMPTY ? "info" : "error",
  };
};

/** 貸借が一致しているかチェック */
const checkDebitCreditBalance = (ctx: PipelineContext): CheckResult => {
  if (!ctx.journalEntry) {
    return { message: "仕訳データが未生成", passed: false, severity: "error" };
  }
  const totalDebit = ctx.journalEntry.entries.reduce((sum, entry) => sum + entry.debit, EMPTY);
  const totalCredit = ctx.journalEntry.entries.reduce((sum, entry) => sum + entry.credit, EMPTY);
  const balanced = Math.abs(totalDebit - totalCredit) < FLOAT_TOLERANCE;
  return {
    message: balanced
      ? `貸借一致: ${totalDebit}円`
      : `貸借不一致: 借方=${totalDebit}, 貸方=${totalCredit}`,
    passed: balanced,
    severity: balanced ? "info" : "error",
  };
};

/** レビュー要否と理由の整合性チェック */
const checkReviewAssigned = (ctx: PipelineContext): CheckResult => {
  if (!ctx.humanReviewRequired) {
    return { message: "人間レビュー不要", passed: true, severity: "info" };
  }
  const hasReasons = ctx.humanReviewReasons.length > EMPTY;
  return {
    message: hasReasons
      ? `レビュー理由: ${ctx.humanReviewReasons.join(", ")}`
      : "レビュー理由が未設定",
    passed: hasReasons,
    severity: hasReasons ? "info" : "warning",
  };
};

/** パイプライン全体の終了条件チェックリストを生成 */
const createChecklist = (): ChecklistItem[] => [
  {
    check: checkExtractionComplete,
    description: "全項目が抽出されていること",
    id: "extraction_complete",
    stage: "extracted",
  },
  {
    check: checkAccountsValid,
    description: "勘定科目がマスターに存在すること",
    id: "accounts_valid",
    stage: "journalized",
  },
  {
    check: checkDebitCreditBalance,
    description: "貸借が一致していること",
    id: "debit_credit_balance",
    stage: "journalized",
  },
  {
    check: checkReviewAssigned,
    description: "承認者が割り当てられていること（要レビュー時）",
    id: "review_assigned",
    stage: "reviewing",
  },
];

/** 指定ステージのチェックリストを実行し、全条件の充足状況を返す */
const runChecklist = (
  checklist: ChecklistItem[],
  stage: PipelineContext["stage"],
  context: PipelineContext,
): { allPassed: boolean; results: CheckResult[] } => {
  const stageChecks = checklist.filter((item) => item.stage === stage);
  const results = stageChecks.map((item) => item.check(context));
  const allPassed = results.every((result) => result.passed);
  return { allPassed, results };
};

export { createChecklist, runChecklist };
