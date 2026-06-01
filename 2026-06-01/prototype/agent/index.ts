// AIエージェント層: 請求書データ抽出
// 多様なフォーマットの請求書テキストから構造化データを抽出する
// プロトタイプではモック抽出で動作。本番ではClaude APIに接続予定

import type { ExtractedInvoice, RawInvoice } from "../types.ts";
import { log } from "../logger.ts";

const MOCK_CONFIDENCE = 0.92;
const DEFAULT_TAX_PERCENT = 10;
const TAX_DIVISOR = 100;
const PAD_LENGTH = 2;
const NO_AMOUNT = 0;
const SINGLE_QUANTITY = 1;
const DEFAULT_DATE = "2026-01-01";
const DEFAULT_DUE_DATE = "2026-06-30";
const DEFAULT_INVOICE_NUM = "T0000000000000";
const UNKNOWN = "不明";

interface ExtractionPrompt {
  role: string;
  content: string;
}

const SYSTEM_PROMPT = `あなたは請求書データ抽出の専門家です。以下の請求書テキストから構造化データをJSON形式で抽出してください。

必ず以下のフィールドを含めてください:
- vendor: 請求元の会社名
- invoiceDate: 請求日（YYYY-MM-DD形式）
- dueDate: 支払期限（YYYY-MM-DD形式）
- items: 明細行の配列（各行にdescription, quantity, unitPrice, amount）
- subtotal: 小計（税抜）
- taxRate: 消費税率（0.1 or 0.08）
- taxAmount: 消費税額
- totalAmount: 合計金額（税込）
- bankInfo: 振込先情報
- invoiceNumber: インボイス登録番号

JSONのみを返してください。説明は不要です。`;

const buildExtractionPrompt = (rawText: string): ExtractionPrompt[] => [
  { content: SYSTEM_PROMPT, role: "system" },
  { content: rawText, role: "user" },
];

const extractDate = (text: string): string => {
  const dateMatch = text.match(/(?<year>\d{4})[-年/](?<month>\d{1,2})[-月/](?<day>\d{1,2})/);
  if (dateMatch === null) {
    return DEFAULT_DATE;
  }
  const year = dateMatch.groups?.["year"] ?? "2026";
  const month = dateMatch.groups?.["month"] ?? "01";
  const day = dateMatch.groups?.["day"] ?? "01";
  return `${year}-${month.padStart(PAD_LENGTH, "0")}-${day.padStart(PAD_LENGTH, "0")}`;
};

const extractAmount = (text: string): number => {
  const totalMatch = text.match(/合計[金額：:\s]*(?<amount>[0-9,]+)/);
  if (totalMatch === null) {
    return NO_AMOUNT;
  }
  const amountStr = totalMatch.groups?.["amount"] ?? "0";
  return Number(amountStr.replaceAll(",", ""));
};

const extractTaxRate = (text: string): number => {
  const taxRateMatch = text.match(/(?<rate>\d+)[%％]/);
  if (taxRateMatch === null) {
    return DEFAULT_TAX_PERCENT / TAX_DIVISOR;
  }
  const rateStr = taxRateMatch.groups?.["rate"] ?? String(DEFAULT_TAX_PERCENT);
  return Number(rateStr) / TAX_DIVISOR;
};

const extractVendor = (text: string): string => {
  const vendorMatch = text.match(/(?<name>^.+?)[\n\r]/m);
  const lines = text.split("\n").filter((line) => line.trim().length > NO_AMOUNT);
  const headerLine = lines.find((line) => line.includes("請求書") || line.includes("御請求書"));
  const vendorLine = headerLine === lines[NO_AMOUNT] ? lines[SINGLE_QUANTITY] : lines[NO_AMOUNT];
  return vendorMatch?.groups?.["name"]?.trim() ?? vendorLine?.trim() ?? UNKNOWN;
};

const extractBankInfo = (text: string): string => {
  const bankMatch = text.match(/振込先[：:\s]*(?<bank>.+)/);
  return bankMatch?.groups?.["bank"] ?? UNKNOWN;
};

const extractInvoiceNumber = (text: string): string => {
  const invoiceNumMatch = text.match(/(?<num>T\d{13})/);
  return invoiceNumMatch?.groups?.["num"] ?? DEFAULT_INVOICE_NUM;
};

const mockExtract = (invoice: RawInvoice): ExtractedInvoice => {
  const text = invoice.rawText;
  const totalAmount = extractAmount(text);
  const taxRate = extractTaxRate(text);
  const subtotal = Math.round(totalAmount / (SINGLE_QUANTITY + taxRate));

  return {
    bankInfo: extractBankInfo(text),
    confidence: MOCK_CONFIDENCE,
    dueDate: DEFAULT_DUE_DATE,
    invoiceDate: extractDate(text),
    invoiceId: invoice.invoiceId,
    invoiceNumber: extractInvoiceNumber(text),
    items: [
      {
        amount: subtotal,
        description: "請求書明細",
        quantity: SINGLE_QUANTITY,
        unitPrice: subtotal,
      },
    ],
    subtotal,
    taxAmount: totalAmount - subtotal,
    taxRate,
    totalAmount,
    vendor: extractVendor(text),
  };
};

const extractInvoiceData = (invoice: RawInvoice): ExtractedInvoice => {
  log(`  [Agent] 請求書 ${invoice.invoiceId} のデータ抽出を開始...`);
  log(`  [Agent] モックモードで抽出`);
  return mockExtract(invoice);
};

export { buildExtractionPrompt, extractInvoiceData };
