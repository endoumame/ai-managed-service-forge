/**
 * Harness/checker.ts — 品質チェック機構
 *
 * なぜこの実装か:
 * AIの抽出結果を「信頼しない」ために、決定論的ルールで品質を検証する。
 * 信頼度スコアが閾値未満の場合はヒューマンレビューにエスカレーションする。
 * これがハーネスの核心的価値: AIの出力を外部から検証する仕組み。
 */

import type { ExtractedInvoice, JournalEntry } from "../types.ts";

interface QualityCheckResult {
  passed: boolean;
  /** 0.0〜1.0 */
  score: number;
  issues: QualityIssue[];
  requiresHumanReview: boolean;
}

interface QualityIssue {
  severity: "error" | "warning" | "info";
  field: string;
  message: string;
}

/** スコアリング・閾値定数 */
const HUMAN_REVIEW_THRESHOLD = 0.8;
const DEDUCTION_MISSING_FIELD = 0.2;
const DEDUCTION_AMOUNT_MISMATCH = 0.3;
const DEDUCTION_DATE_FORMAT = 0.1;
const DEDUCTION_HIGH_AMOUNT = 0.05;
const HIGH_AMOUNT_THRESHOLD = 10_000_000;
const AMOUNT_TOLERANCE = 1;
const ZERO = 0;
const ONE = 1;
const SCORE_FAIL = 0.3;
const SCORE_PASS = 1;

/** フィールド値が有意な値を持つか判定 */
const hasValue = (value: unknown): boolean => {
  if (typeof value === "number") {
    return true;
  }
  if (typeof value === "string") {
    return value.length > ZERO;
  }
  if (typeof value === "object" && value !== null) {
    return !Array.isArray(value) || value.length > ZERO;
  }
  return false;
};

const REQUIRED_FIELDS: (keyof ExtractedInvoice)[] = [
  "vendorName",
  "invoiceNumber",
  "invoiceDate",
  "totalAmount",
  "taxAmount",
];

/** 必須フィールドの存在チェック */
const checkRequiredFields = (
  invoice: ExtractedInvoice,
): { issues: QualityIssue[]; deductions: number } => {
  const issues: QualityIssue[] = [];
  let deductions = ZERO;
  for (const field of REQUIRED_FIELDS) {
    if (!hasValue(invoice[field])) {
      issues.push({ field, message: `必須フィールド「${field}」が未抽出です`, severity: "error" });
      deductions += DEDUCTION_MISSING_FIELD;
    }
  }
  return { deductions, issues };
};

/** 金額整合性チェック: 税抜 + 税額 ≒ 税込合計 */
const checkAmountConsistency = (
  invoice: ExtractedInvoice,
): { issues: QualityIssue[]; deductions: number } => {
  const issues: QualityIssue[] = [];
  let deductions = ZERO;
  if (invoice.subtotalAmount && invoice.taxAmount && invoice.totalAmount) {
    const expectedTotal = invoice.subtotalAmount + invoice.taxAmount;
    if (Math.abs(expectedTotal - invoice.totalAmount) > AMOUNT_TOLERANCE) {
      issues.push({
        field: "totalAmount",
        message: `金額不整合: 税抜(${invoice.subtotalAmount}) + 税(${invoice.taxAmount}) = ${expectedTotal} ≠ 合計(${invoice.totalAmount})`,
        severity: "error",
      });
      deductions += DEDUCTION_AMOUNT_MISMATCH;
    }
  }
  return { deductions, issues };
};

/** 日付フォーマット・高額チェック等の補助的検証 */
const checkSupplementary = (
  invoice: ExtractedInvoice,
): { issues: QualityIssue[]; deductions: number } => {
  const issues: QualityIssue[] = [];
  let deductions = ZERO;
  if (invoice.invoiceDate && !/^\d{4}-\d{2}-\d{2}$/.test(invoice.invoiceDate)) {
    issues.push({
      field: "invoiceDate",
      message: `日付フォーマットが不正: ${invoice.invoiceDate}（YYYY-MM-DD形式を期待）`,
      severity: "warning",
    });
    deductions += DEDUCTION_DATE_FORMAT;
  }
  if (invoice.totalAmount && invoice.totalAmount > HIGH_AMOUNT_THRESHOLD) {
    issues.push({
      field: "totalAmount",
      message: `高額請求書（${invoice.totalAmount.toLocaleString()}円）: 確認を推奨`,
      severity: "warning",
    });
    deductions += DEDUCTION_HIGH_AMOUNT;
  }
  return { deductions, issues };
};

/**
 * 抽出結果の品質チェック
 *
 * 必須フィールドの存在・フォーマット・整合性を決定論的に検証する。
 * AIが「正しく読み取れました」と言っても、ここで弾かれる可能性がある。
 */
const checkExtraction = (invoice: ExtractedInvoice): QualityCheckResult => {
  const checks = [
    checkRequiredFields(invoice),
    checkAmountConsistency(invoice),
    checkSupplementary(invoice),
  ];
  const issues = checks.flatMap((ch) => ch.issues);
  const deductions = checks.reduce((sum, ch) => sum + ch.deductions, ZERO);
  const score = Math.max(ZERO, SCORE_PASS - deductions);

  return {
    issues,
    passed: issues.every((issue) => issue.severity !== "error"),
    requiresHumanReview: score < HUMAN_REVIEW_THRESHOLD,
    score,
  };
};

/** バランスチェック: 借方合計 = 貸方合計 */
const checkBalance = (entry: JournalEntry): QualityIssue[] => {
  const debitTotal = entry.lines.reduce((sum, line) => sum + (line.debitAmount ?? ZERO), ZERO);
  const creditTotal = entry.lines.reduce((sum, line) => sum + (line.creditAmount ?? ZERO), ZERO);
  if (Math.abs(debitTotal - creditTotal) > ZERO) {
    return [
      {
        field: "balance",
        message: `仕訳バランス不一致: 借方合計(${debitTotal}) ≠ 貸方合計(${creditTotal})`,
        severity: "error",
      },
    ];
  }
  return [];
};

/** 仕訳行の存在・勘定科目設定チェック */
const checkJournalLines = (entry: JournalEntry): QualityIssue[] => {
  const issues: QualityIssue[] = [];
  if (entry.lines.length === ZERO) {
    issues.push({ field: "lines", message: "仕訳行が空です", severity: "error" });
  }
  for (const [idx, line] of entry.lines.entries()) {
    if (!line.accountCode || !line.accountName) {
      issues.push({
        field: `lines[${idx}]`,
        message: `仕訳行${idx + ONE}: 勘定科目が未設定`,
        severity: "error",
      });
    }
  }
  return issues;
};

/**
 * 仕訳結果の品質チェック
 *
 * 借方合計 = 貸方合計のバランスチェックは会計の根本原則。
 * これは決定論的に検証できるため、絶対にAIに任せない。
 */
const checkJournalEntry = (entry: JournalEntry): QualityCheckResult => {
  const issues = [...checkBalance(entry), ...checkJournalLines(entry)];
  const hasErrors = issues.some((issue) => issue.severity === "error");
  return {
    issues,
    passed: !hasErrors,
    requiresHumanReview: hasErrors,
    score: hasErrors ? SCORE_FAIL : SCORE_PASS,
  };
};

export { checkExtraction, checkJournalEntry };
export type { QualityCheckResult, QualityIssue };
