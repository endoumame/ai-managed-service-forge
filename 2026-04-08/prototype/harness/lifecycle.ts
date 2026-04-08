/* eslint-disable typescript/strict-boolean-expressions, no-undefined -- Prototype: type narrowing patterns */
/**
 * ライフサイクルフック定義
 *
 * なぜこの実装か:
 * ハーネスの核心は「AIエージェントの入出力を決定論的に検証する」こと。
 * 各フックは純粋関数として実装し、AIの出力を受け取り、
 * バリデーション結果（pass/fail + 理由）を返す。
 */

import type { ExtractedInvoice, JournalEntry } from "../deterministic/rules.ts";

interface HookResult {
  passed: boolean;
  checks: CheckItem[];
  warnings: string[];
}

interface CheckItem {
  name: string;
  passed: boolean;
  reason: string;
}

const EMPTY = 0;
const MIN_INVOICE_LENGTH = 20;
const MAX_AMOUNT = 1_000_000_000;
const RATIO_LOW = 0.85;
const RATIO_HIGH = 1.15;
const RATIO_DECIMAL = 2;
const OLDEST_DATE = "2020-01-01";
const RATIO_LOWER_BOUND = 0.3;
const RATIO_UPPER_BOUND = 3;
const RATIO_DISPLAY_DECIMAL = 1;

const AMOUNT_PATTERN = /[\d,]+円|¥[\d,]+|\d{1,3}(,\d{3})+/;
const DATE_PATTERN = /\d{4}[年/-]\d{1,2}[月/-]\d{1,2}|令和\d+年|R\d+\.\d+\.\d+/;

const VALID_ACCOUNT_CODES = new Set([
  "110",
  "120",
  "130",
  "140",
  "150",
  "200",
  "210",
  "300",
  "310",
  "400",
  "410",
  "500",
  "510",
  "520",
  "530",
  "540",
  "550",
  "600",
  "610",
  "620",
  "630",
  "640",
  "700",
  "710",
  "720",
  "800",
  "810",
  "900",
]);

const buildResult = (checks: CheckItem[], warnings: string[]): HookResult => ({
  checks,
  passed: checks.every((ch) => ch.passed),
  warnings,
});

const checkNonEmpty = (text: string): CheckItem => ({
  name: "非空チェック",
  passed: text.trim().length > EMPTY,
  reason: text.trim().length > EMPTY ? "テキストが存在します" : "空のテキストです",
});

const checkMinLength = (text: string): CheckItem => ({
  name: "最低文字数チェック",
  passed: text.length >= MIN_INVOICE_LENGTH,
  reason:
    text.length >= MIN_INVOICE_LENGTH
      ? `${text.length}文字（最低${MIN_INVOICE_LENGTH}文字以上）`
      : `${text.length}文字しかありません（最低${MIN_INVOICE_LENGTH}文字必要）`,
});

const checkAmountPattern = (text: string): CheckItem => ({
  name: "金額パターン検出",
  passed: AMOUNT_PATTERN.test(text),
  reason: AMOUNT_PATTERN.test(text)
    ? "金額パターンを検出しました"
    : "金額らしきパターンが見つかりません",
});

/** BeforeExtraction: 請求書テキストをAIに渡す前の前処理チェック */
const beforeExtraction = (invoiceText: string): HookResult => {
  const checks = [
    checkNonEmpty(invoiceText),
    checkMinLength(invoiceText),
    checkAmountPattern(invoiceText),
  ];
  const warnings: string[] = [];
  if (!AMOUNT_PATTERN.test(invoiceText)) {
    warnings.push("金額パターンが検出されませんでした。抽出精度が低下する可能性があります。");
  }
  if (!DATE_PATTERN.test(invoiceText)) {
    warnings.push("日付パターンが検出されませんでした。");
  }
  return buildResult(checks, warnings);
};

const checkRequiredFields = (extracted: ExtractedInvoice): CheckItem[] => {
  const requiredFields: (keyof ExtractedInvoice)[] = [
    "vendorName",
    "invoiceDate",
    "totalAmount",
    "items",
  ];
  return requiredFields.map((field) => {
    const value = extracted[field];
    // eslint-disable-next-line no-undefined -- dynamic field access requires undefined check
    const exists = value !== undefined && value !== null && value !== "";
    return {
      name: `必須フィールド: ${field}`,
      passed: exists,
      reason: exists ? `${field} が存在します` : `${field} が未抽出です`,
    };
  });
};

const checkAmountValidity = (totalAmount: number | null): CheckItem[] => {
  if (totalAmount === null) {
    return [];
  }
  const valid = totalAmount > EMPTY && totalAmount < MAX_AMOUNT;
  return [
    {
      name: "合計金額の妥当性",
      passed: valid,
      reason: valid
        ? `合計金額 ${totalAmount.toLocaleString()}円 は妥当な範囲です`
        : `合計金額 ${totalAmount.toLocaleString()}円 は異常値です`,
    },
  ];
};

const checkItemsConsistency = (
  extracted: ExtractedInvoice,
): { checks: CheckItem[]; warnings: string[] } => {
  if (!extracted.items || extracted.items.length === EMPTY || !extracted.totalAmount) {
    return { checks: [], warnings: [] };
  }
  const itemsTotal = extracted.items.reduce((sum, item) => sum + item.amount, EMPTY);
  const ratio = itemsTotal / extracted.totalAmount;
  const consistent = ratio >= RATIO_LOW && ratio <= RATIO_HIGH;
  const checks: CheckItem[] = [
    {
      name: "明細合計と総額の整合性",
      passed: consistent,
      reason: consistent
        ? `明細合計 ${itemsTotal.toLocaleString()}円 / 総額 ${extracted.totalAmount.toLocaleString()}円（税差を許容）`
        : `明細合計 ${itemsTotal.toLocaleString()}円 と総額 ${extracted.totalAmount.toLocaleString()}円 に大きな乖離があります`,
    },
  ];
  const warnings = consistent
    ? []
    : [
        `明細合計(${itemsTotal})と総額(${extracted.totalAmount})の比率: ${ratio.toFixed(RATIO_DECIMAL)} — 人間の確認を推奨`,
      ];
  return { checks, warnings };
};

const getDateReason = (invoiceDate: string, date: Date): string => {
  if (Number.isNaN(date.getTime())) {
    return "無効な日付形式です";
  }
  if (date > new Date()) {
    return "未来の日付です";
  }
  if (date < new Date(OLDEST_DATE)) {
    return "古すぎる日付です";
  }
  return `${invoiceDate} は妥当な範囲です`;
};

const checkDateValidity = (invoiceDate: string | undefined): CheckItem[] => {
  if (!invoiceDate) {
    return [];
  }
  const date = new Date(invoiceDate);
  const reason = getDateReason(invoiceDate, date);
  const passed =
    !Number.isNaN(date.getTime()) && date <= new Date() && date >= new Date(OLDEST_DATE);
  return [{ name: "日付の妥当性", passed, reason }];
};

/** AfterExtraction: AI抽出結果の決定論的バリデーション */
const afterExtraction = (extracted: ExtractedInvoice): HookResult => {
  const itemsResult = checkItemsConsistency(extracted);
  const checks = [
    ...checkRequiredFields(extracted),
    ...checkAmountValidity(extracted.totalAmount),
    ...itemsResult.checks,
    ...checkDateValidity(extracted.invoiceDate),
  ];
  return buildResult(checks, itemsResult.warnings);
};

const checkDebitCreditMatch = (entry: JournalEntry): CheckItem => ({
  name: "借方貸方一致",
  passed: entry.debitAmount === entry.creditAmount,
  reason:
    entry.debitAmount === entry.creditAmount
      ? `借方 ${entry.debitAmount.toLocaleString()}円 = 貸方 ${entry.creditAmount.toLocaleString()}円`
      : `借方 ${entry.debitAmount.toLocaleString()}円 ≠ 貸方 ${entry.creditAmount.toLocaleString()}円`,
});

const checkAccountCode = (code: string, name: string, label: string): CheckItem => ({
  name: `${label}勘定科目の有効性`,
  passed: VALID_ACCOUNT_CODES.has(code),
  reason: VALID_ACCOUNT_CODES.has(code)
    ? `${code} (${name}) は有効です`
    : `${code} は無効な勘定科目コードです`,
});

/** BeforeJournalEntry: 仕訳起票前の整合性チェック */
const beforeJournalEntry = (entry: JournalEntry): HookResult => {
  const checks = [
    checkDebitCreditMatch(entry),
    checkAccountCode(entry.debitAccountCode, entry.debitAccountName, "借方"),
    checkAccountCode(entry.creditAccountCode, entry.creditAccountName, "貸方"),
    {
      name: "摘要の存在",
      passed: entry.description.length > EMPTY,
      reason: entry.description.length > EMPTY ? `摘要: "${entry.description}"` : "摘要が空です",
    },
  ];
  return buildResult(checks, []);
};

/** AfterJournalEntry: 仕訳完了後の異常検知チェック */
const afterJournalEntry = (entry: JournalEntry, historicalAverage: number | null): HookResult => {
  if (historicalAverage === null || historicalAverage <= EMPTY) {
    return buildResult(
      [
        {
          name: "過去平均との比較",
          passed: true,
          reason: "過去データなし（初回取引先）— スキップ",
        },
      ],
      ["初回取引先のため過去比較ができません。内容を確認してください。"],
    );
  }
  const ratio = entry.debitAmount / historicalAverage;
  const withinRange = ratio >= RATIO_LOWER_BOUND && ratio <= RATIO_UPPER_BOUND;
  const fmt = ratio.toFixed(RATIO_DISPLAY_DECIMAL);
  const reason = withinRange
    ? `金額 ${entry.debitAmount.toLocaleString()}円 は過去平均 ${historicalAverage.toLocaleString()}円 の ${fmt}倍（許容範囲内）`
    : `金額 ${entry.debitAmount.toLocaleString()}円 は過去平均 ${historicalAverage.toLocaleString()}円 の ${fmt}倍（異常値）`;
  const warnings = withinRange ? [] : [`要確認: 過去平均から大幅に乖離しています（${fmt}倍）`];
  return buildResult([{ name: "過去平均との比較", passed: withinRange, reason }], warnings);
};

export { afterExtraction, afterJournalEntry, beforeExtraction, beforeJournalEntry };
export type { CheckItem, HookResult };
