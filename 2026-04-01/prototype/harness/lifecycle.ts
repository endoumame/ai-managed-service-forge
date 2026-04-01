/**
 * ライフサイクルフック定義
 *
 * なぜこの実装か:
 * ハーネスの核心は「AIエージェントの各処理ステップに対して、決定論的な
 * バリデーションを挟む」こと。AIが自己完結で処理を進めるのではなく、
 * 各ステップの前後にフックを差し込むことで、ドリフトを早期に検知する。
 *
 * before/afterのペアにすることで、入力の前処理と出力の検証を分離し、
 * 各フックの責務を単純に保つ。
 */

import type { InvoiceData, JournalEntry } from "../deterministic/rules.ts";

// ライフサイクルフックの結果を表す型
interface HookResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

// 各フックの定義
type LifecycleHook<TData> = (data: TData) => HookResult;

const EMPTY_COUNT = 0;

// eslint-disable-next-line no-undefined -- nullish check helper
const isNullish = (val: unknown): val is null | undefined => val === null || val === undefined;

const makeResult = (errors: string[], warnings: string[]): HookResult => ({
  errors,
  passed: errors.length === EMPTY_COUNT,
  warnings,
});

const hasKey = (obj: Record<string, unknown>, ...keys: string[]): boolean =>
  keys.some((key) => key in obj && !isNullish(obj[key]));

/** オブジェクト入力の警告チェック */
const checkObjectWarnings = (obj: Record<string, unknown>, warnings: string[]): void => {
  if (!hasKey(obj, "vendor_name", "vendorName")) {
    warnings.push("取引先名が見つかりません。AIによる推定を試みます");
  }
  if (!hasKey(obj, "total_amount", "totalAmount")) {
    warnings.push("合計金額が見つかりません。AIによる推定を試みます");
  }
};

/**
 * BeforeExtract: 入力データのフォーマット検証
 * AIに渡す前に、入力が最低限の要件を満たしているか確認
 */
const beforeExtract = (rawInput: unknown): HookResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (isNullish(rawInput)) {
    return { errors: ["入力データがnullです"], passed: false, warnings };
  }
  if (typeof rawInput === "string" && rawInput.trim() === "") {
    return { errors: ["入力データが空文字列です"], passed: false, warnings };
  }
  if (typeof rawInput === "object" && !Array.isArray(rawInput)) {
    checkObjectWarnings(Object.fromEntries(Object.entries(rawInput)), warnings);
  }

  return makeResult(errors, warnings);
};

/**
 * AfterExtract: 抽出結果の完全性チェック
 * AIが抽出した結果に必須フィールドがすべて揃っているか確認
 */
const afterExtract = (extracted: Partial<InvoiceData>): HookResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const requiredFields: (keyof InvoiceData)[] = ["vendorName", "invoiceDate", "totalAmount"];

  for (const field of requiredFields) {
    const value = extracted[field];
    if (isNullish(value) || value === "") {
      errors.push(`必須フィールド「${field}」が抽出されていません`);
    }
  }
  if (extracted.items && extracted.items.length === EMPTY_COUNT) {
    warnings.push("明細行が0件です。単一行の請求書の可能性があります");
  }

  return makeResult(errors, warnings);
};

/**
 * AfterClassify: 仕訳科目の妥当性チェック
 * AIが推定した仕訳科目が過去パターンと大きく乖離していないか確認
 */
const afterClassify = (
  entry: JournalEntry,
  historicalPatterns: Map<string, string[]>,
): HookResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!/^\d{3,4}$/.test(entry.accountCode)) {
    errors.push(`勘定科目コード「${entry.accountCode}」の形式が不正です（3〜4桁の数字）`);
  }

  const key = `${entry.vendorName}::${entry.description}`;
  const pastCodes = historicalPatterns.get(key);

  if (pastCodes && pastCodes.length > EMPTY_COUNT && !pastCodes.includes(entry.accountCode)) {
    warnings.push(
      `取引先「${entry.vendorName}」の品目「${entry.description}」に対して、` +
        `過去に使用された科目 [${pastCodes.join(", ")}] と異なる科目「${entry.accountCode}」が推定されました。` +
        `人間の確認が必要です。`,
    );
  }

  return makeResult(errors, warnings);
};

/** 明細行合計と小計の整合性チェック */
const ROUNDING_TOLERANCE = 1;
const SUM_INITIAL = 0;
const HIGH_AMOUNT_WARNING_THRESHOLD = 10_000_000;

const checkItemsTotal = (data: InvoiceData, errors: string[]): void => {
  if (data.items.length > EMPTY_COUNT) {
    const itemsTotal = data.items.reduce((sum, item) => sum + item.amount, SUM_INITIAL);
    if (Math.abs(itemsTotal - data.subtotalAmount) > ROUNDING_TOLERANCE) {
      errors.push(`明細合計(${itemsTotal}) ≠ 小計(${data.subtotalAmount})`);
    }
  }
};

/**
 * BeforeOutput: 最終出力の金額整合性検証
 * 税込 = 税抜 + 消費税 の算術チェック（AIに任せてはいけない決定論的検証）
 */
const beforeOutput = (data: InvoiceData): HookResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  const expectedTotal = data.subtotalAmount + data.taxAmount;
  if (Math.abs(data.totalAmount - expectedTotal) > ROUNDING_TOLERANCE) {
    errors.push(
      `金額整合性エラー: 小計(${data.subtotalAmount}) + 税(${data.taxAmount}) = ${expectedTotal} ≠ 合計(${data.totalAmount})`,
    );
  }
  checkItemsTotal(data, errors);

  if (data.totalAmount > HIGH_AMOUNT_WARNING_THRESHOLD) {
    warnings.push(
      `合計金額が1,000万円を超えています（${data.totalAmount.toLocaleString()}円）。確認を推奨します`,
    );
  }

  return makeResult(errors, warnings);
};

export { afterClassify, afterExtract, beforeExtract, beforeOutput };
export type { HookResult, LifecycleHook };
