/**
 * 決定論的コード層 — ルールベース処理
 *
 * AIに任せてはいけない処理をここに集約する。
 * 税額計算、貸借バランス、フォーマット変換は
 * 全て決定論的に正確でなければならない。
 */

import type { ExtractedInvoiceData, JournalEntry } from "../types.ts";

const TAX_RATE_STANDARD = 0.1;
const TAX_RATE_REDUCED = 0.08;
const DEFAULT_CREDIT_CODE = "2100";
const DEFAULT_CREDIT_NAME = "買掛金";

/** 税額を決定論的に計算する（AIに計算させない） */
const calculateTax = (subtotal: number, isReduced: boolean): number => {
  const rate = isReduced ? TAX_RATE_REDUCED : TAX_RATE_STANDARD;
  return Math.floor(subtotal * rate);
};

/** 抽出データから仕訳エントリを生成する */
const buildJournalEntries = (
  extracted: ExtractedInvoiceData,
  debitCode: string,
  debitName: string,
): JournalEntry[] => {
  const PERCENT = 100;
  const taxCategory = `課税仕入${TAX_RATE_STANDARD * PERCENT}%`;
  const entry: JournalEntry = {
    creditAccount: DEFAULT_CREDIT_NAME,
    creditAmount: extracted.totalAmount,
    date: extracted.invoiceDate,
    debitAccount: debitName,
    debitAmount: extracted.totalAmount,
    description: `${extracted.vendorName} ${extracted.invoiceNumber}`,
    taxAmount: extracted.taxAmount,
    taxCategory,
  };
  return [entry];
};

/** 重複請求チェック（請求番号ベースのexact match） */
const checkDuplicate = (invoiceNumber: string, existingNumbers: string[]): boolean =>
  existingNumbers.includes(invoiceNumber);

/** 仕訳データをCSV形式に変換する（freee互換） */
const toFreeeCSV = (entries: JournalEntry[]): string => {
  const header = "日付,借方勘定科目,借方金額,貸方勘定科目,貸方金額,摘要,税区分,消費税額";
  const rows = entries.map((entry) =>
    [
      entry.date,
      entry.debitAccount,
      String(entry.debitAmount),
      entry.creditAccount,
      String(entry.creditAmount),
      entry.description,
      entry.taxCategory,
      String(entry.taxAmount),
    ].join(","),
  );
  return [header, ...rows].join("\n");
};

export {
  calculateTax,
  buildJournalEntries,
  checkDuplicate,
  toFreeeCSV,
  DEFAULT_CREDIT_CODE,
  DEFAULT_CREDIT_NAME,
};
