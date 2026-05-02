/**
 * ハーネス層: 終了条件管理（プランナー）
 *
 * パイプライン全体の終了条件をチェックリストで外部管理する。
 * AIに「完了」を自己申告させず、全条件が満たされるまで
 * 処理を継続またはエスカレーションする。
 */
import type { ApprovalStatus, ChecklistItem, ExtractedData, JournalEntry } from "../types.ts";

const CONFIDENCE_ESCALATION_THRESHOLD = 0.8;
const EMPTY_COUNT = 0;

interface CompletionChecklist {
  allItemsExtracted: boolean;
  confidenceAboveThreshold: boolean;
  debitCreditBalanced: boolean;
  journalGenerated: boolean;
  taxVerified: boolean;
}

interface PlannerResult {
  checklist: CompletionChecklist;
  escalationReasons: string[];
  recommendation: ApprovalStatus;
}

interface StepCheckInput {
  checkId: string;
  failureMessage: string;
  reasons: string[];
}

/** StepChecksから特定IDのチェック結果を取得し、失敗時にエスカレーション理由を追加 */
const evaluateStepCheck = (stepChecks: ChecklistItem[], input: StepCheckInput): boolean => {
  const check = stepChecks.find((item) => item.id === input.checkId);
  const passed = check?.passed ?? false;
  if (!passed) {
    input.reasons.push(`${input.failureMessage}: ${check?.detail ?? "未検証"}`);
  }
  return passed;
};

/** 抽出データから直接判定できるチェックを実行 */
const evaluateExtractedData = (
  extracted: ExtractedData,
  reasons: string[],
): { allItemsExtracted: boolean; confidenceAboveThreshold: boolean } => {
  const allItemsExtracted = extracted.items.length > EMPTY_COUNT;
  if (!allItemsExtracted) {
    reasons.push("明細行が抽出されていません");
  }

  const confidenceAboveThreshold = extracted.confidence >= CONFIDENCE_ESCALATION_THRESHOLD;
  if (!confidenceAboveThreshold) {
    reasons.push(
      `全体信頼度が閾値未満: ${extracted.confidence} < ${CONFIDENCE_ESCALATION_THRESHOLD}`,
    );
  }

  return { allItemsExtracted, confidenceAboveThreshold };
};

/** StepChecksベースの検証をまとめて実行 */
const evaluateStepChecks = (
  stepChecks: ChecklistItem[],
  reasons: string[],
): { debitCreditBalanced: boolean; taxVerified: boolean } => {
  const taxVerified = evaluateStepCheck(stepChecks, {
    checkId: "tax-calculation",
    failureMessage: "消費税検証失敗",
    reasons,
  });
  const debitCreditBalanced = evaluateStepCheck(stepChecks, {
    checkId: "debit-credit-balance",
    failureMessage: "貸借不一致",
    reasons,
  });
  evaluateStepCheck(stepChecks, {
    checkId: "amount-deviation",
    failureMessage: "金額異常",
    reasons,
  });
  return { debitCreditBalanced, taxVerified };
};

/** 終了条件チェックリストを評価する */
const evaluateCompletion = (
  extracted: ExtractedData,
  journal: JournalEntry | null,
  stepChecks: ChecklistItem[],
): PlannerResult => {
  const escalationReasons: string[] = [];
  const { allItemsExtracted, confidenceAboveThreshold } = evaluateExtractedData(
    extracted,
    escalationReasons,
  );
  const { debitCreditBalanced, taxVerified } = evaluateStepChecks(stepChecks, escalationReasons);

  const journalGenerated = journal !== null;
  if (!journalGenerated) {
    escalationReasons.push("仕訳が生成されていません");
  }

  const checklist: CompletionChecklist = {
    allItemsExtracted,
    confidenceAboveThreshold,
    debitCreditBalanced,
    journalGenerated,
    taxVerified,
  };
  const recommendation: ApprovalStatus =
    escalationReasons.length === EMPTY_COUNT ? "pending" : "escalated";

  return { checklist, escalationReasons, recommendation };
};

/** 終了条件チェックリストを表示用に整形する */
const formatChecklist = (checklist: CompletionChecklist): string => {
  const items = [
    { label: "全項目抽出済み", passed: checklist.allItemsExtracted },
    { label: "信頼度閾値以上", passed: checklist.confidenceAboveThreshold },
    { label: "消費税検証済み", passed: checklist.taxVerified },
    { label: "貸借バランス一致", passed: checklist.debitCreditBalanced },
    { label: "仕訳生成済み", passed: checklist.journalGenerated },
  ];

  return items.map((item) => `  ${item.passed ? "[ok]" : "[NG]"} ${item.label}`).join("\n");
};

export type { CompletionChecklist, PlannerResult };
export { evaluateCompletion, formatChecklist };
