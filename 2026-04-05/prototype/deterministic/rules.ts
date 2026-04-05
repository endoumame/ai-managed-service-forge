/**
 * Deterministic/rules.ts — ルールベース処理
 *
 * なぜこの実装か:
 * 消費税計算・勘定科目マッチング・仕訳生成は100%ルールベースで処理できる。
 * AIに任せると「ほぼ正しいが微妙に違う」結果を返すリスクがある。
 * 決定論的コードで処理することで、正確性を保証する。
 */

import type {
  AccountMaster,
  ExtractedInvoice,
  JournalEntry,
  JournalLine,
  VendorMapping,
} from "../types.ts";

const TAX_RATE_10 = 0.1;
const TAX_RATE_8 = 0.08;
const ROUNDING_THRESHOLD = 2;

/** デフォルト勘定科目マスタ（プロトタイプ用） */
const DEFAULT_ACCOUNTS: AccountMaster[] = [
  { category: "expense", code: "5100", name: "仕入高" },
  { category: "expense", code: "5200", name: "外注費" },
  { category: "expense", code: "5300", name: "消耗品費" },
  { category: "expense", code: "5400", name: "通信費" },
  { category: "expense", code: "5500", name: "旅費交通費" },
  { category: "expense", code: "5600", name: "広告宣伝費" },
  { category: "expense", code: "5700", name: "水道光熱費" },
  { category: "expense", code: "5800", name: "地代家賃" },
  { category: "expense", code: "5900", name: "雑費" },
  { category: "liability", code: "2100", name: "買掛金" },
  { category: "liability", code: "2110", name: "未払金" },
  { category: "asset", code: "1150", name: "仮払消費税" },
];

/**
 * 消費税額を計算する（決定論的処理）
 * 税率は10%と8%（軽減税率）のみ対応
 */
const calculateTax = (subtotal: number, taxRate: number): number => {
  const rate =
    Math.abs(taxRate - TAX_RATE_8) < Math.abs(taxRate - TAX_RATE_10) ? TAX_RATE_8 : TAX_RATE_10;
  return Math.floor(subtotal * rate);
};

/**
 * 消費税計算の検証
 * AI抽出の税額と決定論的計算結果を比較する
 */
const validateTaxAmount = (
  invoice: ExtractedInvoice,
): { valid: boolean; expected: number; actual: number } => {
  const expected = calculateTax(invoice.subtotalAmount, invoice.taxRate);
  const actual = invoice.taxAmount;
  return {
    actual,
    expected,
    valid: Math.abs(expected - actual) <= ROUNDING_THRESHOLD,
  };
};

/**
 * 取引先名から勘定科目を決定する
 * ナレッジベースのマッピング → デフォルトルールの優先順で検索
 */
const resolveAccount = (vendorName: string, mappings: VendorMapping[]): AccountMaster => {
  const mapping = mappings.find((mp) => mp.vendorName === vendorName);
  if (typeof mapping === "object" && mapping !== null) {
    const account = DEFAULT_ACCOUNTS.find((acc) => acc.code === mapping.accountCode);
    if (typeof account === "object" && account !== null) {
      return account;
    }
  }
  const fallback = DEFAULT_ACCOUNTS.find((acc) => acc.code === "5900");
  if (typeof fallback === "object" && fallback !== null) {
    return fallback;
  }
  return { category: "expense", code: "5900", name: "雑費" };
};

/**
 * 抽出データから仕訳エントリを生成する（決定論的処理）
 *
 * 仕訳の基本構造:
 *   借方: 費用科目（税抜金額）＋ 仮払消費税（税額）
 *   貸方: 買掛金（税込金額）
 * 借方合計 = 貸方合計 を構造的に保証する
 */
const generateJournalEntry = (
  invoice: ExtractedInvoice,
  mappings: VendorMapping[],
): JournalEntry => {
  const account = resolveAccount(invoice.vendorName, mappings);
  const lines: JournalLine[] = [
    {
      accountCode: account.code,
      accountName: account.name,
      debitAmount: invoice.subtotalAmount,
    },
    {
      accountCode: "1150",
      accountName: "仮払消費税",
      debitAmount: invoice.taxAmount,
    },
    {
      accountCode: "2100",
      accountName: "買掛金",
      creditAmount: invoice.totalAmount,
    },
  ];

  return {
    description: `${invoice.vendorName} - ${invoice.invoiceNumber}`,
    entryDate: invoice.invoiceDate,
    invoiceRef: invoice.invoiceNumber,
    lines,
  };
};

/**
 * 請求書の重複チェック（決定論的処理）
 * 請求番号 + 取引先 + 金額 の組み合わせで判定
 */
const checkDuplicate = (invoice: ExtractedInvoice, existingInvoices: ExtractedInvoice[]): boolean =>
  existingInvoices.some(
    (existing) =>
      existing.invoiceNumber === invoice.invoiceNumber &&
      existing.vendorName === invoice.vendorName &&
      existing.totalAmount === invoice.totalAmount,
  );

export {
  DEFAULT_ACCOUNTS,
  calculateTax,
  checkDuplicate,
  generateJournalEntry,
  resolveAccount,
  validateTaxAmount,
};
