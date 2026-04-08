/**
 * AIエージェントレイヤー
 *
 * なぜこの実装か:
 * 請求書テキストからの構造化データ抽出はAIが最も得意とする領域。
 * ただし、AIの出力は必ずハーネスの決定論的バリデーションを通す。
 * MOCK_AI=true でAPIキーなしのデモ動作をサポートする。
 */

/* eslint-disable typescript/no-unsafe-assignment, typescript/no-unsafe-call, typescript/no-unsafe-member-access, typescript/no-unsafe-return, typescript/no-unsafe-type-assertion, typescript/strict-boolean-expressions -- Anthropic SDK types not available in lint context */

import Anthropic from "@anthropic-ai/sdk";

import type { ExtractedInvoice } from "../deterministic/rules.ts";
import type { LookupResult } from "../knowledge/store.ts";

interface AccountSuggestion {
  accountCode: string;
  accountName: string;
  confidence: number;
  source: string;
}

const MODEL_ID = "claude-sonnet-4-20250514";
const MAX_TOKENS = 1024;
const MOCK_TOTAL = 88_000;
const MOCK_ITEM_AMOUNT_1 = 50_000;
const MOCK_ITEM_AMOUNT_2 = 30_000;
const MOCK_TAX_RATE = 0.1;
const MOCK_CONFIDENCE = 0.92;
const KB_CONFIDENCE = 0.95;
const AI_CONFIDENCE = 0.75;

const EXTRACTION_PROMPT_LINES = [
  "以下の請求書テキストから構造化データを抽出してJSON形式で返してください。",
  "フィールド: vendorName, invoiceDate(YYYY-MM-DD), totalAmount(数値),",
  "items([{name, amount, quantity?, unitPrice?}]), invoiceNumber(任意), taxRate(任意)",
  "JSONのみ返してください。説明は不要です。",
];

const MOCK_EXTRACTED: ExtractedInvoice = {
  invoiceDate: "2026-03-31",
  invoiceNumber: "INV-2026-0042",
  items: [
    { amount: MOCK_ITEM_AMOUNT_1, name: "クラウドサーバー利用料（3月分）" },
    { amount: MOCK_ITEM_AMOUNT_2, name: "ソフトウェアライセンス（年間）" },
  ],
  taxRate: MOCK_TAX_RATE,
  totalAmount: MOCK_TOTAL,
  vendorName: "株式会社テックサービス",
};

const isMockMode = (): boolean => process.env["MOCK_AI"] === "true";

const buildExtractionPrompt = (invoiceText: string): string =>
  [...EXTRACTION_PROMPT_LINES, "", "--- 請求書テキスト ---", invoiceText].join("\n");

const parseAiResponse = (text: string): ExtractedInvoice => {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("AIレスポンスからJSONを抽出できませんでした");
  }
  const [matched] = jsonMatch;
  return JSON.parse(matched) as ExtractedInvoice;
};

const callClaudeApi = async (prompt: string): Promise<string> => {
  const client = new Anthropic();
  const message = await client.messages.create({
    max_tokens: MAX_TOKENS,
    messages: [{ content: prompt, role: "user" }],
    model: MODEL_ID,
  });
  const [block] = message.content;
  if (!block || block.type !== "text") {
    throw new Error("AI応答にテキストブロックが含まれていません");
  }
  return block.text;
};

const extractInvoiceData = async (invoiceText: string): Promise<ExtractedInvoice> => {
  if (isMockMode()) {
    // eslint-disable-next-line no-console -- Demo output for mock mode indication
    console.log("[Agent] モックモード: サンプルデータを返します");
    return MOCK_EXTRACTED;
  }
  const prompt = buildExtractionPrompt(invoiceText);
  const responseText = await callClaudeApi(prompt);
  return parseAiResponse(responseText);
};

const suggestFromKnowledge = (lookupResult: LookupResult): AccountSuggestion | null => {
  if (!lookupResult.found || !lookupResult.mapping) {
    return null;
  }
  return {
    accountCode: lookupResult.mapping.accountCode,
    accountName: lookupResult.mapping.accountName,
    confidence: KB_CONFIDENCE,
    source: "knowledge-base",
  };
};

const buildAiSuggestionPrompt = (itemName: string): string =>
  `以下の品目に最適な勘定科目コードと名称をJSON形式で返してください: "${itemName}"`;

const suggestAccountCode = async (
  itemName: string,
  lookupResult: LookupResult,
): Promise<AccountSuggestion> => {
  const kbSuggestion = suggestFromKnowledge(lookupResult);
  if (kbSuggestion) {
    return kbSuggestion;
  }
  if (isMockMode()) {
    return {
      accountCode: "630",
      accountName: "消耗品費",
      confidence: MOCK_CONFIDENCE,
      source: "mock-ai",
    };
  }
  const prompt = buildAiSuggestionPrompt(itemName);
  const responseText = await callClaudeApi(prompt);
  const parsed = JSON.parse(responseText) as { accountCode: string; accountName: string };
  return { ...parsed, confidence: AI_CONFIDENCE, source: "ai-suggestion" };
};

export { extractInvoiceData, suggestAccountCode };
export type { AccountSuggestion };
