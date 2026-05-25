// ハーネス層: 品質チェック
// AIの出力を決定論的に検証し、ドリフトを検知する

import type {
  ExtractedInvoice,
  HarnessContext,
  JournalEntry,
  ValidationError,
  ValidationResult,
  ValidationWarning,
} from "../types.ts";

const AMOUNT_TOLERANCE = 1;
const CONFIDENCE_THRESHOLD = 0.8;
const PERCENTAGE_MULTIPLIER = 100;
const ZERO = 0;
const CONFIDENCE_LABEL = "80%";

// 標準勘定科目マスタ（プロトタイプ用の最小セット）
const VALID_ACCOUNT_CODES: Record<string, string> = {
  "211": "買掛金",
  "212": "未払金",
  "213": "未払費用",
  "511": "仕入高",
  "611": "役員報酬",
  "613": "給料手当",
  "621": "法定福利費",
  "631": "旅費交通費",
  "632": "通信費",
  "633": "消耗品費",
  "634": "事務用品費",
  "635": "水道光熱費",
  "636": "広告宣伝費",
  "637": "接待交際費",
  "638": "地代家賃",
  "639": "保険料",
  "641": "租税公課",
  "642": "支払手数料",
  "643": "外注費",
  "644": "リース料",
  "645": "修繕費",
  "646": "雑費",
  "651": "減価償却費",
};

const isEmpty = (arr: unknown[]): boolean => arr.length === ZERO;
const isNonEmpty = (arr: unknown[]): boolean => !isEmpty(arr);

const getAccountName = (code: string): string | null =>
  // eslint-disable-line unicorn/no-null
  VALID_ACCOUNT_CODES[code] ?? null; // eslint-disable-line unicorn/no-null

const getValidAccountCodes = (): Record<string, string> => ({ ...VALID_ACCOUNT_CODES });

const checkAmountErrors = (extracted: ExtractedInvoice): ValidationError[] => {
  const errors: ValidationError[] = [];

  const calculatedTotal = extracted.subtotal + extracted.taxAmount;
  if (Math.abs(calculatedTotal - extracted.totalAmount) > AMOUNT_TOLERANCE) {
    errors.push({
      actual: extracted.totalAmount,
      expected: calculatedTotal,
      field: "totalAmount",
      message: "小計＋税額と合計額が一致しません",
    });
  }

  const itemsTotal = extracted.items.reduce((sum, item) => sum + item.amount, ZERO);
  if (Math.abs(itemsTotal - extracted.subtotal) > AMOUNT_TOLERANCE) {
    errors.push({
      actual: extracted.subtotal,
      expected: itemsTotal,
      field: "subtotal",
      message: "明細行の合計と小計が一致しません",
    });
  }

  return errors;
};

const checkJournalErrors = (journal: JournalEntry): ValidationError[] => {
  const errors: ValidationError[] = [];

  if (typeof VALID_ACCOUNT_CODES[journal.debitAccount] !== "string") {
    errors.push({
      field: "debitAccount",
      message: `勘定科目コード「${journal.debitAccount}」は標準科目に存在しません`,
    });
  }

  if (Math.abs(journal.debitAmount - journal.creditAmount) > ZERO) {
    errors.push({
      actual: journal.creditAmount,
      expected: journal.debitAmount,
      field: "journalBalance",
      message: "仕訳の貸借が一致しません",
    });
  }

  return errors;
};

const checkWarnings = (extracted: ExtractedInvoice, journal: JournalEntry): ValidationWarning[] => {
  const warnings: ValidationWarning[] = [];

  const expectedTax = Math.floor(extracted.subtotal * extracted.taxRate);
  if (Math.abs(expectedTax - extracted.taxAmount) > AMOUNT_TOLERANCE) {
    warnings.push({
      field: "taxAmount",
      message: `税額が税率${extracted.taxRate * PERCENTAGE_MULTIPLIER}%の再計算と一致しません（期待: ${expectedTax}, 実際: ${extracted.taxAmount}）`,
    });
  }

  if (journal.confidence < CONFIDENCE_THRESHOLD) {
    warnings.push({
      field: "confidence",
      message: `勘定科目の信頼度が低い（${(journal.confidence * PERCENTAGE_MULTIPLIER).toFixed(ZERO)}%）`,
    });
  }

  return warnings;
};

const buildChecklist = (
  errors: ValidationError[],
  checklist: HarnessContext["checklist"],
): HarnessContext["checklist"] => ({
  ...checklist,
  accountCodeValid: !errors.some((err) => err.field === "debitAccount"),
  amountsConsistent: !errors.some((err) => err.field === "totalAmount" || err.field === "subtotal"),
  journalBalanced: !errors.some((err) => err.field === "journalBalance"),
});

const buildReviewReasons = (
  existing: string[],
  journal: JournalEntry,
  errors: ValidationError[],
): string[] => {
  const reasons = [...existing];
  if (journal.confidence < CONFIDENCE_THRESHOLD) {
    reasons.push(
      `勘定科目の信頼度が${(journal.confidence * PERCENTAGE_MULTIPLIER).toFixed(ZERO)}%で閾値（${CONFIDENCE_LABEL}）未満`,
    );
  }
  if (isNonEmpty(errors)) {
    reasons.push(`バリデーションエラー: ${errors.map((err) => err.message).join("; ")}`);
  }
  return reasons;
};

const buildValidationResult = (
  ctx: HarnessContext,
  extracted: ExtractedInvoice,
  journal: JournalEntry,
): HarnessContext => {
  const errors = [...checkAmountErrors(extracted), ...checkJournalErrors(journal)];
  const warnings = checkWarnings(extracted, journal);
  const validation: ValidationResult = { errors, isValid: isEmpty(errors), warnings };

  return {
    ...ctx,
    checklist: buildChecklist(errors, ctx.checklist),
    humanReviewReasons: buildReviewReasons(ctx.humanReviewReasons, journal, errors),
    humanReviewRequired:
      ctx.humanReviewRequired || journal.confidence < CONFIDENCE_THRESHOLD || isNonEmpty(errors),
    validation,
  };
};

const validateJournal = async (ctx: HarnessContext): Promise<HarnessContext> => {
  if (!ctx.extracted || !ctx.journal) {
    return ctx;
  }
  const result = await Promise.resolve(buildValidationResult(ctx, ctx.extracted, ctx.journal));
  return result;
};

export { getAccountName, getValidAccountCodes, validateJournal };
