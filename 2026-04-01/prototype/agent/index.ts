/**
 * AIエージェント層
 *
 * なぜこの実装か:
 * AIが担当するのは「推論のアップサイドが大きく、ミスのダウンサイドが小さい」部分:
 * - 非定型請求書のレイアウト解析・項目抽出
 * - 仕訳科目の推定（過去パターンからの類推）
 * - 曖昧な品目名の正規化
 *
 * 重要: AIの出力はハーネスが必ず検証する。AIの自己申告は信頼しない。
 * Anthropic Claude APIを使用し、Structured Outputで結果のJSON出力を強制する。
 */

import type { InvoiceData, JournalEntry } from "../deterministic/rules.ts";
import type { JournalPattern, KnowledgeData } from "../knowledge/store.ts";
import { findPattern } from "../knowledge/store.ts";
import { getAccountName } from "../deterministic/rules.ts";

const DEFAULT_CONFIDENCE = 0.5;
const HIGH_CONFIDENCE = 0.95;
const BASE_CONFIDENCE = 0.7;
const ZERO_AMOUNT = 0;
const FIRST_ITEM_IDX = 0;
const DEFAULT_ACCOUNT_CODE = "531";

interface ExtractionResult {
  data: Partial<InvoiceData>;
  confidenceScores: Record<string, number>;
}

interface ClassificationResult {
  entry: JournalEntry;
  reasoning: string;
}

interface ParsedAmounts {
  subtotal: number;
  tax: number;
  total: number;
}

const stringOrEmpty = (val: unknown): string => (typeof val === "string" ? val : "");

const parseLineItems = (val: unknown): InvoiceData["items"] => {
  if (!Array.isArray(val)) {
    return [];
  }
  return val.map((item: Record<string, unknown>) => ({
    amount: Number(item["amount"]) || ZERO_AMOUNT,
    description: stringOrEmpty(item["description"]),
    quantity: Number(item["quantity"]) || ZERO_AMOUNT,
    taxRate: Number(item["taxRate"]) || ZERO_AMOUNT,
    unitPrice: Number(item["unitPrice"]) || ZERO_AMOUNT,
  }));
};

const parseAmounts = (raw: Record<string, unknown>): ParsedAmounts => ({
  subtotal: Number(raw["subtotalAmount"]) || ZERO_AMOUNT,
  tax: Number(raw["taxAmount"]) || ZERO_AMOUNT,
  total: Number(raw["totalAmount"]) || ZERO_AMOUNT,
});

const buildConfidenceScores = (data: Partial<InvoiceData>): Record<string, number> => ({
  invoiceDate:
    typeof data.invoiceDate === "string" && data.invoiceDate.length > ZERO_AMOUNT
      ? HIGH_CONFIDENCE
      : DEFAULT_CONFIDENCE,
  totalAmount:
    typeof data.totalAmount === "number" && data.totalAmount > ZERO_AMOUNT
      ? HIGH_CONFIDENCE
      : DEFAULT_CONFIDENCE,
  vendorName:
    typeof data.vendorName === "string" && data.vendorName.length > ZERO_AMOUNT
      ? HIGH_CONFIDENCE
      : DEFAULT_CONFIDENCE,
});

/**
 * 請求書データからの項目抽出（AIエージェント）
 *
 * プロトタイプではClaude APIの代わりにルールベースの模擬実装。
 * 本番ではこの関数内でClaude APIを呼び出す。
 */
const extractInvoiceData = (rawInvoice: Record<string, unknown>): ExtractionResult => {
  const data: Partial<InvoiceData> = {
    dueDate: stringOrEmpty(rawInvoice["dueDate"]),
    invoiceDate: stringOrEmpty(rawInvoice["invoiceDate"]),
    invoiceId: stringOrEmpty(rawInvoice["invoiceId"]),
    items: parseLineItems(rawInvoice["items"]),
    vendorName: stringOrEmpty(rawInvoice["vendorName"]),
    vendorRegistrationNumber: stringOrEmpty(rawInvoice["vendorRegistrationNumber"]),
  };

  const amounts = parseAmounts(rawInvoice);
  data.subtotalAmount = amounts.subtotal;
  data.taxAmount = amounts.tax;
  data.totalAmount = amounts.total;

  return { confidenceScores: buildConfidenceScores(data), data };
};

/** 品目名から勘定科目コードを推定（プロトタイプ用の簡易マッピング） */
const KEYWORD_ACCOUNT_MAP: [string, string][] = [
  ["コンサル", "527"],
  ["外注", "527"],
  ["開発", "527"],
  ["通信", "521"],
  ["電話", "521"],
  ["文房具", "522"],
  ["消耗品", "522"],
  ["交通", "524"],
  ["タクシー", "524"],
  ["広告", "525"],
  ["家賃", "528"],
  ["保険", "529"],
];

const estimateAccountCode = (description: string): string => {
  for (const [keyword, code] of KEYWORD_ACCOUNT_MAP) {
    if (description.includes(keyword)) {
      return code;
    }
  }
  return DEFAULT_ACCOUNT_CODE;
};

const buildFromKnownPattern = (
  invoice: InvoiceData,
  description: string,
  pattern: JournalPattern,
): ClassificationResult => ({
  entry: {
    accountCode: pattern.accountCode,
    accountName: pattern.accountName,
    confidence: HIGH_CONFIDENCE,
    creditAmount: invoice.totalAmount,
    debitAmount: invoice.totalAmount,
    description,
    taxCategory: "課税仕入10%",
    vendorName: invoice.vendorName,
  },
  reasoning: `過去パターンに一致: ${pattern.vendorName}×${pattern.description} -> ${pattern.accountCode}`,
});

const buildFromAIEstimation = (invoice: InvoiceData, description: string): ClassificationResult => {
  const estimatedCode = estimateAccountCode(description);
  const accountName = getAccountName(estimatedCode) ?? "不明";

  return {
    entry: {
      accountCode: estimatedCode,
      accountName,
      confidence: BASE_CONFIDENCE,
      creditAmount: invoice.totalAmount,
      debitAmount: invoice.totalAmount,
      description,
      taxCategory: "課税仕入10%",
      vendorName: invoice.vendorName,
    },
    reasoning: `AI推定: 品目「${description}」から科目「${estimatedCode}: ${accountName}」を推定`,
  };
};

/**
 * 仕訳科目の推定（AIエージェント）
 *
 * ナレッジストアの過去パターンを参照し、マッチすれば高信頼度で返す。
 * マッチしなければAI推定として低めの信頼度で返す。
 */
const classifyJournalEntry = (
  invoice: InvoiceData,
  knowledge: KnowledgeData,
): ClassificationResult => {
  const primaryItem = invoice.items.length > ZERO_AMOUNT ? invoice.items[FIRST_ITEM_IDX] : null;
  const description = primaryItem === null ? "不明" : primaryItem.description;

  const knownPattern = findPattern(knowledge, invoice.vendorName, description) ?? null;

  if (knownPattern === null) {
    return buildFromAIEstimation(invoice, description);
  }

  return buildFromKnownPattern(invoice, description, knownPattern);
};

export { classifyJournalEntry, extractInvoiceData };
export type { ClassificationResult, ExtractionResult };
