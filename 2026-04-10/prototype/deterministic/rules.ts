/**
 * 決定論的コード層 — ルールベース処理
 *
 * なぜこの層が必要か:
 * 税率計算やフォーマットバリデーションは「正解が一意に決まる」処理であり、
 * AIに任せるとハルシネーションのリスクがある。決定論的コードで100%正確に処理する。
 */

import type { AnomalyCheck, Invoice, InvoiceItem } from "../types.ts";

// ===== 定数 =====

/** 税率計算の基準乗数（1 + taxRate の 1） */
const TAX_BASE_MULTIPLIER = 1;

/** 端数処理で許容する誤差（円） */
const TAX_ROUNDING_TOLERANCE = 1;

/** 仕訳の借方・貸方バランスの許容誤差（円） */
const BALANCE_TOLERANCE = 1;

/** 重複判定の日数閾値 */
const DUPLICATE_DAYS_THRESHOLD = 7;

/** 重複スコア: 同日以内 */
const DUPLICATE_SCORE_SAME_DAY = 1;

/** 重複スコア: 7日以内 */
const DUPLICATE_SCORE_WITHIN_WEEK = 0.8;

/** 1日のミリ秒数 */
const MS_PER_DAY = 86_400_000;

/** 仕訳ID のゼロパディング桁数 */
const JOURNAL_ID_PAD_LENGTH = 6;

/** Reduce等の数値集計の初期値 */
const SUM_INITIAL = 0;

/** 0ベースインデックスから1ベース表示番号への変換オフセット */
const INDEX_OFFSET = 1;

// ===== 消費税計算 =====

/** 税率から税込額を計算（端数切り捨て） */
const calculateTaxInclusiveAmount = (taxExclusiveAmount: number, taxRate: number): number =>
  Math.floor(taxExclusiveAmount * (TAX_BASE_MULTIPLIER + taxRate));

/** 明細行の税額を検証（許容誤差: TAX_ROUNDING_TOLERANCE円） */
const validateItemTax = (
  item: InvoiceItem,
): {
  valid: boolean;
  expectedTax: number;
} => {
  const expectedTax = Math.floor(item.amount * item.taxRate);
  const diff = Math.abs(item.taxAmount - expectedTax);
  return { expectedTax, valid: diff <= TAX_ROUNDING_TOLERANCE };
};

/** 明細税額合計と請求書税額の整合性チェック */
const checkTaxTotalConsistency = (invoice: Invoice): string[] => {
  const itemTaxTotal = invoice.items.reduce((sum, item) => sum + item.taxAmount, SUM_INITIAL);
  if (Math.abs(itemTaxTotal - invoice.taxAmount) > invoice.items.length) {
    return [`税額不整合: 明細合計=${itemTaxTotal}円, 請求書税額=${invoice.taxAmount}円`];
  }
  return [];
};

/** 小計+税額 = 税込合計額の整合性チェック */
const checkAmountConsistency = (invoice: Invoice): string[] => {
  const itemSubtotal = invoice.items.reduce((sum, item) => sum + item.amount, SUM_INITIAL);
  const expectedTotal = itemSubtotal + invoice.taxAmount;
  if (Math.abs(expectedTotal - invoice.totalAmount) > invoice.items.length) {
    return [
      `合計額不整合: 小計${itemSubtotal}+税${invoice.taxAmount}=${expectedTotal}円, 請求書合計=${invoice.totalAmount}円`,
    ];
  }
  return [];
};

/** 各明細行の税額を個別検証 */
const checkItemTaxes = (items: InvoiceItem[]): string[] => {
  const errors: string[] = [];
  for (const [index, item] of items.entries()) {
    const result = validateItemTax(item);
    if (!result.valid) {
      errors.push(
        `明細${index + INDEX_OFFSET}: 税額不整合 記載=${item.taxAmount}円, 期待=${result.expectedTax}円`,
      );
    }
  }
  return errors;
};

/** 請求書全体の税額整合性を検証 */
const validateInvoiceTax = (invoice: Invoice): { valid: boolean; errors: string[] } => {
  const errors = [
    ...checkTaxTotalConsistency(invoice),
    ...checkAmountConsistency(invoice),
    ...checkItemTaxes(invoice.items),
  ];
  return { errors, valid: errors.length === SUM_INITIAL };
};

// ===== インボイス番号バリデーション =====

/**
 * インボイス登録番号の形式チェック
 * 正しい形式: T + 13桁の数字（例: T1234567890123）
 */
const validateInvoiceRegistrationNumber = (
  num?: string,
): {
  valid: boolean;
  error?: string;
} => {
  if (typeof num !== "string" || num === "") {
    return { error: "インボイス登録番号が未記載です", valid: false };
  }
  const pattern = /^T\d{13}$/;
  if (!pattern.test(num)) {
    return {
      error: `インボイス登録番号の形式が不正です: ${num}（正しい形式: T + 13桁数字）`,
      valid: false,
    };
  }
  return { valid: true };
};

// ===== 仕訳バランスチェック =====

/** 借方合計 = 貸方合計を検証 */
const validateJournalBalance = (
  lines: { debit: number; credit: number }[],
): {
  valid: boolean;
  debitTotal: number;
  creditTotal: number;
} => {
  const debitTotal = lines.reduce((sum, line) => sum + line.debit, SUM_INITIAL);
  const creditTotal = lines.reduce((sum, line) => sum + line.credit, SUM_INITIAL);
  return {
    creditTotal,
    debitTotal,
    valid: Math.abs(debitTotal - creditTotal) <= BALANCE_TOLERANCE,
  };
};

// ===== 日付バリデーション =====

/** YYYY-MM-DD形式の日付として妥当か検証 */
const validateDate = (dateStr: string): { valid: boolean; error?: string } => {
  const pattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!pattern.test(dateStr)) {
    return {
      error: `日付形式が不正です: ${dateStr}（正しい形式: YYYY-MM-DD）`,
      valid: false,
    };
  }
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) {
    return { error: `無効な日付です: ${dateStr}`, valid: false };
  }
  return { valid: true };
};

// ===== 重複チェック =====

/** 2つの請求書間の日付差（日数）を計算 */
const daysBetween = (dateA: string, dateB: string): number =>
  Math.abs((new Date(dateA).getTime() - new Date(dateB).getTime()) / MS_PER_DAY);

/** 重複候補となる請求書かどうかを判定 */
const isDuplicateCandidate = (invoice: Invoice, past: Invoice): boolean =>
  past.id !== invoice.id &&
  past.vendor === invoice.vendor &&
  past.totalAmount === invoice.totalAmount &&
  daysBetween(invoice.issueDate, past.issueDate) <= DUPLICATE_DAYS_THRESHOLD;

/**
 * 請求書の重複候補を検出
 * 同一取引先 × 同一金額 × 日付が7日以内 の場合にフラグ
 */
const detectDuplicates = (invoice: Invoice, pastInvoices: Invoice[]): AnomalyCheck | null => {
  const match = pastInvoices.find((past) => isDuplicateCandidate(invoice, past)) ?? null;
  if (match === null) {
    return null;
  }
  const daysDiff = daysBetween(invoice.issueDate, match.issueDate);
  return {
    details: { daysDifference: daysDiff, matchedInvoiceId: match.id },
    message: `重複請求の疑い: ${match.vendor} ${match.totalAmount}円（${match.issueDate}発行, 請求書番号: ${match.invoiceNumber}）`,
    score:
      daysDiff <= DUPLICATE_SCORE_SAME_DAY ? DUPLICATE_SCORE_SAME_DAY : DUPLICATE_SCORE_WITHIN_WEEK,
    type: "duplicate_suspect",
  };
};

// ===== 仕訳番号採番 =====

/** 連番管理（プロトタイプではシンプルなカウンター） */
let journalCounter = SUM_INITIAL;

const generateJournalId = (): string => {
  journalCounter += INDEX_OFFSET;
  return `JE-${String(journalCounter).padStart(JOURNAL_ID_PAD_LENGTH, "0")}`;
};

const resetJournalCounter = (): void => {
  journalCounter = SUM_INITIAL;
};

export {
  calculateTaxInclusiveAmount,
  detectDuplicates,
  generateJournalId,
  resetJournalCounter,
  validateDate,
  validateInvoiceRegistrationNumber,
  validateInvoiceTax,
  validateItemTax,
  validateJournalBalance,
};
