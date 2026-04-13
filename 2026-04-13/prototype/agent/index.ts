/**
 * AIエージェント層 — 請求書解析・仕訳推定
 *
 * なぜAIを使うか:
 * 請求書のフォーマットは取引先ごとに異なり、ルールベースでは対応しきれない。
 * 自然言語理解・パターン認識はAIの得意領域であり、推論のアップサイドが大きい。
 * ただし、AIの出力は必ずハーネス層の品質ゲートを通す（信頼しない設計）。
 *
 * モック戦略:
 * 環境変数 MOCK_AI=true でモックモードになり、APIキーなしでデモ可能。
 * 実API利用時は ANTHROPIC_API_KEY を設定する。
 */

/* eslint-disable no-console, no-magic-numbers, require-await, typescript-eslint/strict-boolean-expressions, typescript-eslint/no-unsafe-type-assertion, sort-imports */

import type { JournalEntry, ParsedInvoice } from "../types/index.js";
import { ACCOUNT_MASTER } from "../deterministic/rules.js";
import { getVendorPattern } from "../knowledge/store.js";

const MOCK_MODE = process.env["MOCK_AI"] === "true" || !process.env["ANTHROPIC_API_KEY"];
const MODEL_ID = "claude-sonnet-4-20250514";
const MOCK_CONFIDENCE = 0.92;
const TAX_RATE_10 = 0.1;
const MAX_TOKENS = 2048;
const JSON_INDENT = 2;

// ── モックデータ: デモ用のサンプル請求書解析結果 ──

const MOCK_PARSED_INVOICE: ParsedInvoice = {
  confidence: MOCK_CONFIDENCE,
  dueDate: "2026-04-30",
  invoiceDate: "2026-04-01",
  invoiceNumber: "INV-2026-0413",
  lineItems: [
    {
      amount: 150_000,
      description: "クラウドサーバー利用料（4月分）",
      quantity: 1,
      unitPrice: 150_000,
    },
    { amount: 30_000, description: "ドメイン管理・SSL証明書", quantity: 1, unitPrice: 30_000 },
    {
      amount: 50_000,
      description: "技術コンサルティング（4時間）",
      quantity: 4,
      unitPrice: 12_500,
    },
  ],
  subtotal: 230_000,
  taxAmount: 23_000,
  taxRate: TAX_RATE_10,
  totalAmount: 253_000,
  vendor: "テックサービス株式会社",
};

const createMockJournal = (parsed: ParsedInvoice): JournalEntry => {
  const vendorPattern = getVendorPattern(parsed.vendor);
  const defaultExpenseCode = vendorPattern?.lastUsedAccounts.at(0) ?? "6110";
  const defaultExpenseName = ACCOUNT_MASTER[defaultExpenseCode]?.name ?? "通信費";

  return {
    date: parsed.invoiceDate,
    description: `${parsed.vendor} ${parsed.invoiceNumber}`,
    entries: [
      {
        accountCode: defaultExpenseCode,
        accountName: defaultExpenseName,
        credit: 0,
        debit: parsed.subtotal,
        taxCategory: "taxable_10",
      },
      {
        accountCode: "2140",
        accountName: "仮払消費税",
        credit: 0,
        debit: parsed.taxAmount,
        taxCategory: "non_taxable",
      },
      {
        accountCode: "2120",
        accountName: "未払金",
        credit: parsed.totalAmount,
        debit: 0,
        taxCategory: "non_taxable",
      },
    ],
    invoiceNumber: parsed.invoiceNumber,
    vendor: parsed.vendor,
  };
};

// ── ヘルパー: Claude APIレスポンスからJSONを抽出 ──

const extractJsonFromResponse = (response: {
  content: { type: string; text?: string }[];
}): unknown => {
  const [text] = response.content;
  if (!text || text.type !== "text" || !text.text) {
    throw new Error("Unexpected response type from Claude API");
  }
  const jsonMatch = text.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Could not extract JSON from Claude response");
  }
  return JSON.parse(jsonMatch[0]);
};

// ── 実API呼び出し ──

const callClaudeForParsing = async (rawText: string): Promise<ParsedInvoice> => {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();

  const response = await client.messages.create({
    max_tokens: MAX_TOKENS,
    messages: [
      {
        content: `以下の請求書テキストから情報を抽出し、JSON形式で返してください。

必ず以下の形式で返してください（JSONのみ、説明不要）:
{
  "vendor": "取引先名",
  "invoiceNumber": "請求書番号",
  "invoiceDate": "YYYY-MM-DD",
  "dueDate": "YYYY-MM-DD",
  "lineItems": [{"description": "品名", "quantity": 数量, "unitPrice": 単価, "amount": 金額}],
  "subtotal": 小計,
  "taxRate": 税率（0.1 or 0.08）,
  "taxAmount": 税額,
  "totalAmount": 合計金額,
  "confidence": 0.0〜1.0の確信度
}

請求書テキスト:
${rawText}`,
        role: "user",
      },
    ],
    model: MODEL_ID,
  });

  return extractJsonFromResponse(response) as ParsedInvoice;
};

const buildClassificationPrompt = (parsed: ParsedInvoice): string => {
  const accountList = Object.entries(ACCOUNT_MASTER)
    .map(([code, info]) => `${code}: ${info.name}`)
    .join("\n");

  return `以下の請求書データに対する仕訳を生成してください。

利用可能な勘定科目:
${accountList}

請求書データ:
${JSON.stringify(parsed, null, JSON_INDENT)}

以下の形式でJSONのみ返してください:
{
  "date": "${parsed.invoiceDate}",
  "vendor": "${parsed.vendor}",
  "invoiceNumber": "${parsed.invoiceNumber}",
  "description": "摘要",
  "entries": [
    {"accountCode": "コード", "accountName": "科目名", "debit": 借方, "credit": 貸方, "taxCategory": "taxable_10|taxable_8|exempt|non_taxable"}
  ]
}

ルール:
- 借方合計 = 貸方合計（貸借一致必須）
- 費用科目は借方、負債科目（未払金等）は貸方
- 消費税は仮払消費税(2140)で計上`;
};

const callClaudeForClassification = async (parsed: ParsedInvoice): Promise<JournalEntry> => {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();

  const response = await client.messages.create({
    max_tokens: MAX_TOKENS,
    messages: [{ content: buildClassificationPrompt(parsed), role: "user" }],
    model: MODEL_ID,
  });

  return extractJsonFromResponse(response) as JournalEntry;
};

// ── 公開API ──

const parseInvoice = async (rawText: string): Promise<ParsedInvoice> => {
  if (MOCK_MODE) {
    console.log("  [Agent] モックモードで請求書を解析中...");
    return MOCK_PARSED_INVOICE;
  }
  console.log("  [Agent] Claude APIで請求書を解析中...");
  return callClaudeForParsing(rawText);
};

const classifyToJournal = async (parsed: ParsedInvoice): Promise<JournalEntry> => {
  if (MOCK_MODE) {
    console.log("  [Agent] モックモードで仕訳を推定中...");
    return createMockJournal(parsed);
  }
  console.log("  [Agent] Claude APIで仕訳を推定中...");
  return callClaudeForClassification(parsed);
};

export { classifyToJournal, MOCK_MODE, parseInvoice };
