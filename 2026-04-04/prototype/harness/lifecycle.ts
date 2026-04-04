/**
 * ハーネス ライフサイクルフック定義
 *
 * AIが各ステップの前後で決定論的バリデーションを受ける。
 * フックはパイプラインの各段階で自動実行される。
 */

import type {
  AccountClassification,
  ExtractedInvoiceData,
  HookResult,
  JournalEntry,
} from "../types.ts";

const TAX_RATE_STANDARD = 0.1;
const TAX_RATE_REDUCED = 0.08;
const VALID_TAX_RATES = [TAX_RATE_STANDARD, TAX_RATE_REDUCED];
const TAX_RATE_TOLERANCE = 0.02;
const PERCENT = 100;
const PERCENT_DECIMALS = 1;
const MIN_TEXT_LENGTH = 20;
const LOW_CONFIDENCE = 0.7;
const CLASSIFICATION_CONFIDENCE = 0.5;
const SMALL_AMOUNT = 100;
const LARGE_AMOUNT = 100_000_000;
const BALANCE_TOLERANCE = 0.01;
const SUBTOTAL_TOLERANCE = 1;
const INITIAL_SUM = 0;

/** 空の HookResult を作成する */
const createResult = (): { warnings: string[]; errors: string[] } => ({
  errors: [],
  warnings: [],
});

/** HookResult にまとめる */
const toHookResult = (result: { warnings: string[]; errors: string[] }): HookResult => ({
  errors: result.errors,
  passed: result.errors.length === INITIAL_SUM,
  warnings: result.warnings,
});

/** BeforeExtraction: 入力テキストの前処理チェック */
const beforeExtraction = (invoiceText: string): HookResult => {
  const result = createResult();
  if (!invoiceText || invoiceText.trim().length === INITIAL_SUM) {
    result.errors.push("請求書テキストが空です");
  }
  if (invoiceText.length < MIN_TEXT_LENGTH) {
    result.warnings.push("請求書テキストが非常に短いです");
  }
  if (/[０-９]/.test(invoiceText)) {
    result.warnings.push("全角数字が含まれています。抽出精度に影響する可能性があります");
  }
  return toHookResult(result);
};

/** 必須フィールド定義: [チェック関数, エラーメッセージ] */
const REQUIRED_FIELD_CHECKS: [(data: ExtractedInvoiceData) => boolean, string][] = [
  [(data) => !data.invoiceDate, "請求日が抽出されていません"],
  [(data) => !data.vendorName, "取引先名が抽出されていません"],
  [(data) => !data.invoiceNumber, "請求番号が抽出されていません"],
  [(data) => data.lineItems.length === INITIAL_SUM, "明細行が1つも抽出されていません"],
  [(data) => data.totalAmount <= INITIAL_SUM, "合計金額が0以下です"],
];

/** 必須フィールドの存在チェック */
const checkRequiredFields = (data: ExtractedInvoiceData): string[] =>
  REQUIRED_FIELD_CHECKS.filter(([check]) => check(data)).map(([, msg]) => msg);

/** 日付の妥当性チェック */
const checkDateValidity = (dateStr: string): string[] => {
  const warnings: string[] = [];
  const invoiceDate = new Date(dateStr);
  const now = new Date();
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - SUBTOTAL_TOLERANCE);
  if (invoiceDate > now) {
    warnings.push(`請求日が未来日付です: ${dateStr}`);
  }
  if (invoiceDate < oneYearAgo) {
    warnings.push(`請求日が1年以上前です: ${dateStr}`);
  }
  return warnings;
};

/** 税率の妥当性チェック */
const checkTaxRate = (data: ExtractedInvoiceData): string[] => {
  if (data.subtotal <= INITIAL_SUM || data.taxAmount <= INITIAL_SUM) {
    return [];
  }
  const rate = data.taxAmount / data.subtotal;
  const valid = VALID_TAX_RATES.some((tr) => Math.abs(rate - tr) < TAX_RATE_TOLERANCE);
  if (valid) {
    return [];
  }
  return [`実効税率(${(rate * PERCENT).toFixed(PERCENT_DECIMALS)}%)が法定税率と乖離しています`];
};

/** 金額・税率の整合性チェック */
const checkAmountConsistency = (data: ExtractedInvoiceData): string[] => {
  const warnings: string[] = [];
  const lineTotal = data.lineItems.reduce((sum, item) => sum + item.amount, INITIAL_SUM);
  if (Math.abs(lineTotal - data.subtotal) > SUBTOTAL_TOLERANCE) {
    warnings.push(`明細行の合計(${lineTotal})と小計(${data.subtotal})が一致しません`);
  }
  warnings.push(...checkTaxRate(data));
  if (data.confidenceScore < LOW_CONFIDENCE) {
    warnings.push(`AI抽出の信頼度が低いです: ${Math.round(data.confidenceScore * PERCENT)}%`);
  }
  return warnings;
};

/** AfterExtraction: 抽出結果の必須フィールド・整合性チェック */
const afterExtraction = (data: ExtractedInvoiceData): HookResult => {
  const result = createResult();
  result.errors.push(...checkRequiredFields(data));
  if (data.invoiceDate) {
    result.warnings.push(...checkDateValidity(data.invoiceDate));
  }
  result.warnings.push(...checkAmountConsistency(data));
  return toHookResult(result);
};

/** 勘定科目のエラーチェック */
const checkClassificationErrors = (classification: AccountClassification): string[] => {
  const errors: string[] = [];
  if (!classification.debitAccountCode) {
    errors.push("借方勘定科目が未設定です");
  }
  if (!classification.creditAccountCode) {
    errors.push("貸方勘定科目が未設定です");
  }
  if (
    classification.debitAccountCode === classification.creditAccountCode &&
    classification.debitAccountCode !== ""
  ) {
    errors.push("借方と貸方が同じ勘定科目です");
  }
  return errors;
};

/** 勘定科目の警告チェック */
const checkClassificationWarnings = (
  classification: AccountClassification,
  extracted: ExtractedInvoiceData,
): string[] => {
  const warnings: string[] = [];
  if (classification.confidence < CLASSIFICATION_CONFIDENCE) {
    warnings.push(
      `勘定科目分類の信頼度が低いです: ${Math.round(classification.confidence * PERCENT)}%`,
    );
  }
  if (extracted.totalAmount < SMALL_AMOUNT) {
    warnings.push(`合計金額が非常に小さいです: ${extracted.totalAmount}円`);
  }
  if (extracted.totalAmount >= LARGE_AMOUNT) {
    warnings.push(`合計金額が非常に大きいです: ${extracted.totalAmount.toLocaleString()}円`);
  }
  return warnings;
};

/** AfterClassification: 勘定科目分類結果の検証 */
const afterClassification = (
  classification: AccountClassification,
  extracted: ExtractedInvoiceData,
): HookResult => {
  const result = createResult();
  result.errors.push(...checkClassificationErrors(classification));
  result.warnings.push(...checkClassificationWarnings(classification, extracted));
  return toHookResult(result);
};

/** 貸借一致チェック — 決定論的、絶対にAIに任せてはいけない */
const checkBalance = (entries: JournalEntry[]): string[] => {
  const totalDebit = entries.reduce((sum, entry) => sum + entry.debitAmount, INITIAL_SUM);
  const totalCredit = entries.reduce((sum, entry) => sum + entry.creditAmount, INITIAL_SUM);
  if (Math.abs(totalDebit - totalCredit) > BALANCE_TOLERANCE) {
    return [
      `貸借不一致: 借方合計=${totalDebit.toLocaleString()}円, 貸方合計=${totalCredit.toLocaleString()}円`,
    ];
  }
  return [];
};

/** 各仕訳エントリの形式チェック */
const checkEntryFormat = (entries: JournalEntry[]): string[] => {
  const errors: string[] = [];
  for (const entry of entries) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
      errors.push(`不正な日付形式: ${entry.date}`);
    }
    if (entry.debitAmount < INITIAL_SUM || entry.creditAmount < INITIAL_SUM) {
      errors.push("金額が負の値です");
    }
  }
  return errors;
};

/** AfterJournalEntry: 仕訳データの最終チェック */
const afterJournalEntry = (entries: JournalEntry[]): HookResult => {
  const result = createResult();
  if (entries.length === INITIAL_SUM) {
    result.errors.push("仕訳が1件も生成されていません");
    return { errors: result.errors, passed: false, warnings: result.warnings };
  }
  result.errors.push(...checkBalance(entries));
  result.errors.push(...checkEntryFormat(entries));
  return toHookResult(result);
};

export { beforeExtraction, afterExtraction, afterClassification, afterJournalEntry };
