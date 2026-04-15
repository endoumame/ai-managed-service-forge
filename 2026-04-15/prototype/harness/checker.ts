/**
 * ハーネス層 — 品質チェック
 *
 * なぜこの実装か:
 * AIの分類結果を鵜呑みにせず、決定論的ルールで品質を検証する。
 * ハーネスが「門番」として機能し、品質基準を満たさない結果を
 * 次のステップに進ませない。これがドリフト防止の要。
 */

import type {
  AccountCode,
  ProcessingRecord,
  ValidationContext,
  ValidationResult,
  VendorPattern,
} from "../types.js";
import { validateInvoice } from "../deterministic/rules.js";

// AI信頼度スコアの閾値（これ未満は人間確認必須）
const CONFIDENCE_THRESHOLD = 0.8;

/**
 * AI分類結果の品質チェックを実行する。
 * 決定論的バリデーション＋信頼度チェックを組み合わせる。
 */
const checkClassificationQuality = (
  record: ProcessingRecord,
  context: QualityCheckContext,
): ValidationResult => {
  if (!record.classification) {
    return {
      invoiceId: record.invoice.id,
      issues: [{ field: "classification", message: "分類結果がありません", severity: "error" }],
      valid: false,
    };
  }

  const validationCtx: ValidationContext = {
    accountMaster: context.accountMaster,
    classification: record.classification,
    invoice: record.invoice,
    pastPatterns: context.pastPatterns,
    processedInvoiceNumbers: context.processedInvoiceNumbers,
  };

  return validateInvoice(validationCtx);
};

interface QualityCheckContext {
  processedInvoiceNumbers: Set<string>;
  pastPatterns: VendorPattern[];
  accountMaster: AccountCode[];
}

/**
 * 人間の確認が必要かどうかを判定する。
 * 低信頼度、新規取引先、バリデーション警告がトリガーとなる。
 */
const requiresHumanReview = (record: ProcessingRecord, pastPatterns: VendorPattern[]): boolean => {
  if (!record.classification) {
    return true;
  }

  if (record.classification.confidence < CONFIDENCE_THRESHOLD) {
    return true;
  }

  const isNewVendor = !pastPatterns.some((pat) => pat.vendor === record.invoice.vendor);
  if (isNewVendor) {
    return true;
  }

  const hasWarnings =
    record.validation?.issues.some((issue) => issue.severity === "warning") ?? false;
  return hasWarnings;
};

/**
 * 信頼度に基づく分類の信頼性ラベルを返す。
 */
const getConfidenceLabel = (confidence: number): string => {
  if (confidence >= CONFIDENCE_THRESHOLD) {
    return "高信頼度";
  }
  const midThreshold = 0.5;
  if (confidence >= midThreshold) {
    return "中信頼度（人間確認推奨）";
  }
  return "低信頼度（人間確認必須）";
};

export { checkClassificationQuality, getConfidenceLabel, requiresHumanReview };
export type { QualityCheckContext };
