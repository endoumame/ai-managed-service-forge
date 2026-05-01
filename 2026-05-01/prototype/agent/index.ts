import type {
  ExtractedInvoiceData,
  Invoice,
  JournalEntry,
  JournalLine,
  KnowledgeBase,
} from "../types.ts";
import { buildJournalEntry } from "../deterministic/rules.ts";
import { findMapping } from "../knowledge/store.ts";

// oxlint-disable eslint(no-magic-numbers) -- サンプルデータの数値定数が必要

// エージェント層: AIによる推論処理を担当する
// プロトタイプではモックモードとClaude APIモードの両方をサポート

/* oxlint-disable typescript-eslint(no-unsafe-member-access),typescript-eslint(no-unsafe-assignment) -- Node.js process.env */
const envVars = process.env;
const apiKey = envVars["ANTHROPIC_API_KEY"] ?? "";
const MOCK_MODE = envVars["INVOICE_FORGE_MOCK"] === "true" || apiKey === "";
/* oxlint-enable typescript-eslint(no-unsafe-member-access),typescript-eslint(no-unsafe-assignment) */

interface ExtractionResult {
  success: boolean;
  data: ExtractedInvoiceData | null;
  error: string | null;
}

const parseJapaneseNumber = (text: string): number => {
  const cleaned = text.replaceAll(/[,，]/g, "").replaceAll("円", "");
  return Number.parseInt(cleaned, 10);
};

const extractField = (rawText: string, pattern: RegExp): string | null => {
  const result = rawText.match(pattern);
  return result?.[1]?.trim() ?? null;
};

const extractAmount = (rawText: string, pattern: RegExp): number => {
  const result = rawText.match(pattern);
  if (result === null) {
    return 0;
  }
  return parseJapaneseNumber(result[1]);
};

const extractItems = (rawText: string): ExtractedInvoiceData["items"] => {
  const itemRegex = /\d+\.\s*(.+?)\s+数量:\s*(\d+)\s+単価:\s*([\d,，]+)円\s+金額:\s*([\d,，]+)円/g;
  const items: ExtractedInvoiceData["items"] = [];
  let match = itemRegex.exec(rawText);
  while (match !== null) {
    items.push({
      amount: parseJapaneseNumber(match[4]),
      description: match[1].trim(),
      quantity: Number.parseInt(match[2], 10),
      taxRate: 0.1,
      unitPrice: parseJapaneseNumber(match[3]),
    });
    match = itemRegex.exec(rawText);
  }
  return items;
};

const mockExtract = (rawText: string): ExtractedInvoiceData => ({
  dueDate: extractField(rawText, /支払期日:\s*(.+)/),
  invoiceDate: extractField(rawText, /発行日:\s*(.+)/) ?? "",
  invoiceNumber: extractField(rawText, /請求書番号:\s*(\S+)/) ?? "",
  items: extractItems(rawText),
  subtotal: extractAmount(rawText, /小計:\s*([\d,，]+)/),
  taxAmount: extractAmount(rawText, /消費税[^:：]*[:：]\s*([\d,，]+)/),
  totalAmount: extractAmount(rawText, /合計:\s*([\d,，]+)/),
  vendorName: extractField(rawText, /請求元:\s*(.+)/) ?? "",
});

/* oxlint-disable typescript-eslint(no-unsafe-assignment),typescript-eslint(no-unsafe-call),typescript-eslint(no-unsafe-member-access),typescript-eslint(no-unsafe-type-assertion),typescript-eslint(no-unsafe-argument) -- 動的インポートSDKの型推論制限 */
const extractWithClaude = async (rawText: string): Promise<ExtractedInvoiceData> => {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();

  const response = await client.messages.create({
    max_tokens: 2048,
    messages: [
      {
        content: `以下の請求書テキストから情報を抽出し、JSON形式で返してください。

請求書テキスト:
${rawText}

以下のJSON形式で返してください（コードブロックなし、JSONのみ）:
{
  "vendorName": "取引先名",
  "invoiceNumber": "請求書番号",
  "invoiceDate": "発行日",
  "dueDate": "支払期日 (なければnull)",
  "items": [
    {
      "description": "品目名",
      "quantity": 数量,
      "unitPrice": 単価,
      "amount": 金額,
      "taxRate": 0.1
    }
  ],
  "subtotal": 小計,
  "taxAmount": 消費税額,
  "totalAmount": 合計金額
}`,
        role: "user",
      },
    ],
    model: "claude-sonnet-4-20250514",
  });

  const [text] = response.content;
  if (text.type !== "text") {
    throw new Error("Unexpected response type");
  }
  return JSON.parse(text.text) as ExtractedInvoiceData;
};
/* oxlint-enable typescript-eslint(no-unsafe-assignment),typescript-eslint(no-unsafe-call),typescript-eslint(no-unsafe-member-access),typescript-eslint(no-unsafe-type-assertion) */

const extractInvoiceData = async (invoice: Invoice): Promise<ExtractionResult> => {
  try {
    const data = MOCK_MODE
      ? mockExtract(invoice.rawText)
      : await extractWithClaude(invoice.rawText);
    return { data, error: null, success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { data: null, error: message, success: false };
  }
};

const buildOverrideMap = (
  kb: KnowledgeBase,
  vendorName: string,
  items: { description: string }[],
): Map<string, JournalLine> => {
  const overrides = new Map<string, JournalLine>();
  for (const item of items) {
    const mapping = findMapping(kb, vendorName, item.description);
    if (mapping !== null) {
      overrides.set(item.description, {
        accountCode: mapping.accountCode,
        accountName: mapping.accountName,
        amount: 0,
      });
    }
  }
  return overrides;
};

const classifyInvoice = (extracted: ExtractedInvoiceData, kb: KnowledgeBase): JournalEntry => {
  const overrides = buildOverrideMap(kb, extracted.vendorName, extracted.items);
  return buildJournalEntry(extracted, overrides);
};

export { classifyInvoice, extractInvoiceData };
