/**
 * 決定論的コード層
 *
 * ルールベースで確実に実行する部分。AIの推論は一切使わない。
 * 消費税計算、仕訳データ生成、金額検証など、ルールが明確で
 * 間違いが許されない処理を担当する。
 */

import type { AccountClassification, ExtractedInvoice, JournalEntry, LineItem } from "../types.ts";
import type { DeterministicInterface } from "../harness/planner.ts";

/** Reduce の初期値 */
const SUM_INITIAL = 0;

/** 標準税率 10% */
const STANDARD_TAX_RATE = 0.1;

/** 軽減税率 8% */
const REDUCED_TAX_RATE = 0.08;

/** 買掛金の勘定科目コード（貸方のデフォルト） */
const ACCOUNTS_PAYABLE_CODE = "2100";

/** 買掛金の勘定科目名 */
const ACCOUNTS_PAYABLE_NAME = "買掛金";

/** 明細行の消費税額を計算する（税率区分に基づく決定論的計算） */
const calculateItemTax = (item: LineItem): number => {
  const rate = item.taxCategory === "reduced" ? REDUCED_TAX_RATE : STANDARD_TAX_RATE;
  return Math.floor(item.amount * rate);
};

/** 請求書全体の消費税額を再計算する（外部検証用） */
const recalculateTax = (invoice: ExtractedInvoice): number =>
  invoice.lineItems.reduce((total, item) => total + calculateItemTax(item), SUM_INITIAL);

/** 仕訳データを生成する（複式簿記: 借方 = 貸方を保証） */
const generateJournalEntry = (
  invoice: ExtractedInvoice,
  classification: AccountClassification,
): JournalEntry => ({
  creditAccount: `${ACCOUNTS_PAYABLE_CODE} ${ACCOUNTS_PAYABLE_NAME}`,
  creditAmount: invoice.totalAmount,
  date: invoice.invoiceDate,
  debitAccount: `${classification.accountCode} ${classification.accountName}`,
  debitAmount: invoice.totalAmount,
  description: invoice.lineItems.map((item) => item.description).join(", "),
  invoiceNumber: invoice.invoiceNumber,
  vendorName: invoice.vendorName,
});

/** 決定論的コード層の実装を生成する */
const createDeterministic = (): DeterministicInterface => ({
  generateJournalEntry,
});

export { createDeterministic, recalculateTax };
