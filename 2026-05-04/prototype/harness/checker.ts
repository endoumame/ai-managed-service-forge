import type { ExtractedData, JournalCandidate, PipelineContext } from "../types.ts";
import { logger } from "../logger.ts";

const INVOICE_NUMBER_PATTERN = /^T\d{13}$/;
const CONFIDENCE_THRESHOLD = 0.8;
const ANOMALY_MULTIPLIER = 3;

const validateInvoiceNumber = (num: string | null): boolean => {
  if (num === null) {
    return false;
  }
  return INVOICE_NUMBER_PATTERN.test(num);
};

const checkDebitCreditBalance = (candidate: JournalCandidate): boolean => {
  let totalDebit = 0;
  let totalCredit = 0;
  for (const entry of candidate.entries) {
    totalDebit += entry.debitAmount;
    totalCredit += entry.creditAmount;
  }
  return Math.abs(totalDebit - totalCredit) < Number.EPSILON;
};

const EMPTY_LENGTH = 0;

const validateExtractedFields = (extracted: ExtractedData): string[] => {
  const errors: string[] = [];
  if (extracted.vendorName.length === EMPTY_LENGTH) {
    errors.push("取引先名が空です");
  }
  if (extracted.totalAmount <= EMPTY_LENGTH) {
    errors.push("合計金額が0以下です");
  }
  if (extracted.items.length === EMPTY_LENGTH) {
    errors.push("明細が空です");
  }
  if (!validateInvoiceNumber(extracted.qualifiedInvoiceNumber)) {
    errors.push(`インボイス番号の形式が不正です: ${extracted.qualifiedInvoiceNumber ?? "未設定"}`);
  }
  return errors;
};

const afterExtractHook = (context: PipelineContext): PipelineContext => {
  const extracted = context.extractedData;
  if (extracted === null) {
    return { ...context, validationErrors: ["抽出データが存在しません"] };
  }
  const errors = validateExtractedFields(extracted);
  return { ...context, validationErrors: errors };
};

const validateCandidate = (
  candidate: JournalCandidate,
): { errors: string[]; warnings: string[] } => {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!checkDebitCreditBalance(candidate)) {
    errors.push("貸借バランスが不一致です");
  }
  if (candidate.confidenceScore < CONFIDENCE_THRESHOLD) {
    warnings.push(`信頼度が閾値未満です (${candidate.confidenceScore} < ${CONFIDENCE_THRESHOLD})`);
  }
  return { errors, warnings };
};

const afterClassifyHook = (context: PipelineContext): PipelineContext => {
  if (context.journalCandidate === null) {
    return { ...context, validationErrors: ["仕訳候補が生成されていません"] };
  }
  const { errors, warnings } = validateCandidate(context.journalCandidate);
  return { ...context, validationErrors: errors, warnings };
};

const checkAmountAnomaly = (
  extracted: ExtractedData,
  knowledge: PipelineContext["knowledge"],
): string[] => {
  const warnings: string[] = [];
  const vendorKey = extracted.normalizedVendorName;
  const stats = knowledge.averageAmounts[vendorKey];

  if (!(vendorKey in knowledge.averageAmounts)) {
    return warnings;
  }

  const deviation = Math.abs(extracted.totalAmount - stats.mean);
  if (deviation > stats.stddev * ANOMALY_MULTIPLIER) {
    warnings.push(
      `金額異常: ${extracted.totalAmount}円は平均${stats.mean}円から${ANOMALY_MULTIPLIER}σ以上乖離`,
    );
  }

  return warnings;
};

const beforeCommitHook = (context: PipelineContext): PipelineContext => {
  const warnings: string[] = [];

  if (context.extractedData !== null) {
    const anomalyWarnings = checkAmountAnomaly(context.extractedData, context.knowledge);
    warnings.push(...anomalyWarnings);
  }

  if (context.journalCandidate !== null && context.journalCandidate.needsHumanReview) {
    logger.info("ヒューマンレビューが必要な仕訳候補です");
  }

  return { ...context, validationErrors: [], warnings };
};

export { afterClassifyHook, afterExtractHook, beforeCommitHook };
