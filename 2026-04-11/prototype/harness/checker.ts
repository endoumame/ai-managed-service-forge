/**
 * ハーネス: 品質チェック
 *
 * なぜ品質チェックを決定論的コードで行うか:
 * 「小計＋消費税＝合計」は算術的な不変条件であり、AIに判断させる必要がない。
 * AIが「合計は正しい」と自己申告しても信用せず、ハーネスが独立に検算する。
 * これがドリフト対策の核心 — AIの品質自己過信を防ぐ。
 */

import type { ExtractedInvoice, HookResult, JournalEntry } from "../types.ts";

const AMOUNT_TOLERANCE = 1;
const DEVIATION_THRESHOLD = 0.3;
const DUPLICATE_WINDOW_DAYS = 7;
const MS_PER_DAY = 86_400_000;
const PERCENTAGE = 100;
const INITIAL_SUM = 0;
const INDEX_OFFSET = 1;
const EMPTY = 0;

const sumLineAmounts = (extracted: ExtractedInvoice): number =>
  extracted.lineItems.reduce((sum, item) => sum + item.amount, INITIAL_SUM);

const sumLineTaxes = (extracted: ExtractedInvoice): number =>
  extracted.lineItems.reduce(
    (sum, item) => sum + Math.round(item.amount * item.taxRate),
    INITIAL_SUM,
  );

const validateLineItems = (extracted: ExtractedInvoice): string[] => {
  const errors: string[] = [];
  for (let idx = EMPTY; idx < extracted.lineItems.length; idx += INDEX_OFFSET) {
    const item = extracted.lineItems[idx];
    const expected = item.quantity * item.unitPrice;
    if (Math.abs(item.amount - expected) > AMOUNT_TOLERANCE) {
      errors.push(
        `明細行${idx + INDEX_OFFSET} "${item.description}": 金額不整合 (${item.quantity}×${item.unitPrice}=${expected}, 記載=${item.amount})`,
      );
    }
  }
  return errors;
};

const checkSubtotal = (extracted: ExtractedInvoice): string[] => {
  const calculated = sumLineAmounts(extracted);
  if (Math.abs(extracted.subtotal - calculated) > AMOUNT_TOLERANCE) {
    return [`小計不整合: 計算値=${calculated}, 記載値=${extracted.subtotal}`];
  }
  return [];
};

const checkTax = (extracted: ExtractedInvoice): string[] => {
  const calculated = sumLineTaxes(extracted);
  if (Math.abs(extracted.taxAmount - calculated) > extracted.lineItems.length) {
    return [
      `消費税額に差異あり: 計算値=${calculated}, 記載値=${extracted.taxAmount} (端数処理の差の可能性)`,
    ];
  }
  return [];
};

const checkTotal = (extracted: ExtractedInvoice): string[] => {
  const calculated = extracted.subtotal + extracted.taxAmount;
  if (Math.abs(extracted.totalAmount - calculated) > AMOUNT_TOLERANCE) {
    return [
      `合計不整合: 小計(${extracted.subtotal})+税(${extracted.taxAmount})=${calculated}, 記載合計=${extracted.totalAmount}`,
    ];
  }
  return [];
};

/**
 * 金額整合チェック（決定論的検算）
 *
 * 以下の不変条件を検証:
 * 1. 各明細行の金額 = 数量 × 単価
 * 2. 小計 = Σ(明細行金額)
 * 3. 消費税額 = Σ(明細行金額 × 税率)
 * 4. 合計 = 小計 + 消費税額
 */
const validateAmounts = (extracted: ExtractedInvoice): HookResult => {
  const messages = [
    ...validateLineItems(extracted),
    ...checkSubtotal(extracted),
    ...checkTotal(extracted),
  ];
  const passed = messages.length === EMPTY;
  if (passed) {
    messages.push("金額整合チェック: OK");
  }
  return { messages, passed, warnings: checkTax(extracted) };
};

const sumDebits = (je: JournalEntry): number =>
  je.entries.reduce((sum, line) => sum + line.debit, INITIAL_SUM);

const calcDeviationRate = (entry: JournalEntry, vendorHistory: JournalEntry[]): number => {
  const historicalAmounts = vendorHistory.map((he) => sumDebits(he));
  const avgAmount =
    historicalAmounts.reduce((sum, amt) => sum + amt, INITIAL_SUM) / historicalAmounts.length;
  const currentAmount = sumDebits(entry);
  return Math.abs(currentAmount - avgAmount) / avgAmount;
};

const formatDeviationWarning = (entry: JournalEntry, vendorHistory: JournalEntry[]): string => {
  const historicalAmounts = vendorHistory.map((he) => sumDebits(he));
  const avgAmount =
    historicalAmounts.reduce((sum, amt) => sum + amt, INITIAL_SUM) / historicalAmounts.length;
  const currentAmount = sumDebits(entry);
  const rate = Math.abs(currentAmount - avgAmount) / avgAmount;
  return (
    `金額乖離警告: 取引先"${entry.vendorName}" 今回=${currentAmount}円, ` +
    `過去平均=${Math.round(avgAmount)}円 (乖離率: ${Math.round(rate * PERCENTAGE)}%)`
  );
};

/**
 * 過去パターンとの乖離チェック
 *
 * 同一取引先の過去仕訳と比較し、金額が±30%以上乖離していれば警告。
 * 目的: AIが異常な金額を「正しい」と判断してしまうドリフトを検出する。
 */
const checkDeviation = (entry: JournalEntry, historicalEntries: JournalEntry[]): HookResult => {
  const vendorHistory = historicalEntries.filter((he) => he.vendorId === entry.vendorId);

  if (vendorHistory.length === EMPTY) {
    const msg = `取引先 "${entry.vendorName}" は新規取引先です。初回仕訳のため人間確認を推奨します。`;
    return { messages: [], passed: true, warnings: [msg] };
  }

  const warnings =
    calcDeviationRate(entry, vendorHistory) > DEVIATION_THRESHOLD
      ? [formatDeviationWarning(entry, vendorHistory)]
      : [];

  return { messages: ["乖離チェック: OK"], passed: true, warnings };
};

/**
 * 重複請求チェック
 *
 * 同一取引先×同一金額×近接日付（7日以内）の請求書を検出する。
 */
const checkDuplicate = (
  invoice: ExtractedInvoice,
  existingInvoices: ExtractedInvoice[],
): HookResult => {
  const warnings: string[] = [];

  const potentialDuplicates = existingInvoices.filter((existing) => {
    if (existing.invoiceId === invoice.invoiceId) {
      return false;
    }
    if (existing.vendorName !== invoice.vendorName) {
      return false;
    }
    if (Math.abs(existing.totalAmount - invoice.totalAmount) > AMOUNT_TOLERANCE) {
      return false;
    }
    const daysDiff = Math.abs(
      (new Date(existing.invoiceDate).getTime() - new Date(invoice.invoiceDate).getTime()) /
        MS_PER_DAY,
    );
    return daysDiff <= DUPLICATE_WINDOW_DAYS;
  });

  if (potentialDuplicates.length > EMPTY) {
    const ids = potentialDuplicates.map((dup) => dup.invoiceId).join(", ");
    warnings.push(
      `重複請求の可能性: ${ids} と類似 (同一取引先, 同一金額, ${DUPLICATE_WINDOW_DAYS}日以内)`,
    );
  }

  return { messages: ["重複チェック: OK"], passed: true, warnings };
};

export { checkDeviation, checkDuplicate, validateAmounts };
