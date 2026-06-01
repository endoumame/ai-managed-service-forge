// ハーネス層: ライフサイクルフック管理
// AIの各処理ステップの前後にバリデーションを挟み、ドリフトを防止する

import type { ExtractedInvoice, HookResult, JournalEntry, MatchResult } from "../types.ts";
import { log } from "../logger.ts";

type HookFn<TData> = (data: TData) => HookResult;

const NO_AMOUNT = 0;
const MIN_TEXT_LENGTH = 50;
const MAX_SAFE_AMOUNT = 100_000_000;
const LOW_CONFIDENCE = 0.5;
const MODERATE_CONFIDENCE = 0.7;
const HIGH_CONFIDENCE = 0.8;
const ROUNDING_TOLERANCE = 1;
const LARGE_AMOUNT_DIFF = 0.1;
const MODERATE_AMOUNT_DIFF = 0.05;
const PERCENT = 100;

const makeResult = (errors: string[], warnings: string[]): HookResult => ({
  errors,
  passed: errors.length === NO_AMOUNT,
  warnings,
});

const validateRequiredFields = (extracted: ExtractedInvoice, errors: string[]): void => {
  if (!extracted.vendor) {
    errors.push("取引先名が抽出できませんでした");
  }
  if (!extracted.invoiceDate) {
    errors.push("請求日が抽出できませんでした");
  }
  if (extracted.totalAmount <= NO_AMOUNT) {
    errors.push("合計金額が0以下です");
  }
  if (extracted.items.length === NO_AMOUNT) {
    errors.push("明細行が1つも抽出できませんでした");
  }
};

const validateAmountAndTax = (
  extracted: ExtractedInvoice,
  errors: string[],
  warnings: string[],
): void => {
  if (extracted.totalAmount > MAX_SAFE_AMOUNT) {
    warnings.push(`合計金額が1億円を超えています: ${extracted.totalAmount.toLocaleString()}円`);
  }

  const expectedTax = Math.round(extracted.subtotal * extracted.taxRate);
  const taxDiff = Math.abs(extracted.taxAmount - expectedTax);
  if (taxDiff > ROUNDING_TOLERANCE) {
    errors.push(
      `消費税額の不整合: 期待値=${expectedTax}円, 抽出値=${extracted.taxAmount}円 (差額=${taxDiff}円)`,
    );
  }
};

const validateConfidence = (confidence: number, errors: string[], warnings: string[]): void => {
  if (confidence < LOW_CONFIDENCE) {
    errors.push(`抽出信頼度が低すぎます: ${confidence}`);
  } else if (confidence < MODERATE_CONFIDENCE) {
    warnings.push(`抽出信頼度がやや低い: ${confidence}`);
  }
};

const validateJournalEntry = (entry: JournalEntry, errors: string[], warnings: string[]): void => {
  const totalDebit = entry.debit.amount + (entry.taxEntry?.debit.amount ?? NO_AMOUNT);
  const totalCredit = entry.credit.amount + (entry.taxEntry?.credit.amount ?? NO_AMOUNT);

  if (Math.abs(totalDebit - totalCredit) > ROUNDING_TOLERANCE) {
    errors.push(`仕訳バランス不一致: 借方=${totalDebit}円, 貸方=${totalCredit}円`);
  }
  if (entry.confidence < HIGH_CONFIDENCE) {
    entry.status = "pending-review";
    warnings.push(`仕訳信頼度が閾値未満: ${entry.confidence} (閾値: ${HIGH_CONFIDENCE})`);
  }
  if (!entry.debit.accountCode || !entry.credit.accountCode) {
    errors.push("勘定科目コードが未設定です");
  }
};

const validateMatchResult = (match: MatchResult, errors: string[], warnings: string[]): void => {
  if (match.matchedPoId === null) {
    warnings.push("発注書との照合ができませんでした。手動照合が必要です");
  }
  if (match.matchConfidence < MODERATE_CONFIDENCE) {
    match.needsHumanReview = true;
    match.reviewReason = `照合信頼度が低い: ${match.matchConfidence}`;
    warnings.push(match.reviewReason);
  }
  if (Math.abs(match.amountDifference) > LARGE_AMOUNT_DIFF) {
    errors.push(
      `発注額との差異が10%を超えています: ${(match.amountDifference * PERCENT).toFixed(ROUNDING_TOLERANCE)}%`,
    );
  } else if (Math.abs(match.amountDifference) > MODERATE_AMOUNT_DIFF) {
    warnings.push(
      `発注額との差異が5%を超えています: ${(match.amountDifference * PERCENT).toFixed(ROUNDING_TOLERANCE)}%`,
    );
  }
};

interface LifecycleHooks {
  beforeExtract: HookFn<{ rawText: string }>;
  afterExtract: HookFn<ExtractedInvoice>;
  afterMatch: HookFn<MatchResult>;
  afterJournalEntry: HookFn<JournalEntry>;
}

const hooks: LifecycleHooks = {
  afterExtract(extracted) {
    const errors: string[] = [];
    const warnings: string[] = [];
    validateRequiredFields(extracted, errors);
    validateAmountAndTax(extracted, errors, warnings);
    validateConfidence(extracted.confidence, errors, warnings);
    return makeResult(errors, warnings);
  },

  afterJournalEntry(entry) {
    const errors: string[] = [];
    const warnings: string[] = [];
    validateJournalEntry(entry, errors, warnings);
    return makeResult(errors, warnings);
  },

  afterMatch(match) {
    const errors: string[] = [];
    const warnings: string[] = [];
    validateMatchResult(match, errors, warnings);
    return makeResult(errors, warnings);
  },

  beforeExtract({ rawText }) {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!rawText || rawText.trim().length === NO_AMOUNT) {
      errors.push("請求書テキストが空です");
    }
    if (rawText.length < MIN_TEXT_LENGTH) {
      warnings.push("テキストが短すぎます。読み取り精度が低い可能性があります");
    }
    return makeResult(errors, warnings);
  },
};

const logHookResult = (hookName: string, result: HookResult): HookResult => {
  const prefix = result.passed ? "✓" : "✗";
  log(`  [Hook] ${prefix} ${hookName}`);
  for (const err of result.errors) {
    log(`    ✗ ERROR: ${err}`);
  }
  for (const warn of result.warnings) {
    log(`    ⚠ WARN: ${warn}`);
  }
  return result;
};

const runBeforeExtract = (data: { rawText: string }): HookResult =>
  logHookResult("beforeExtract", hooks.beforeExtract(data));

const runAfterExtract = (data: ExtractedInvoice): HookResult =>
  logHookResult("afterExtract", hooks.afterExtract(data));

const runAfterMatch = (data: MatchResult): HookResult =>
  logHookResult("afterMatch", hooks.afterMatch(data));

const runAfterJournalEntry = (data: JournalEntry): HookResult =>
  logHookResult("afterJournalEntry", hooks.afterJournalEntry(data));

export { runAfterExtract, runAfterJournalEntry, runAfterMatch, runBeforeExtract };
