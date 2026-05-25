// AIエージェント層: 請求書解析と仕訳分類
// AIの推論は「項目抽出」と「勘定科目推定」に限定し、計算は決定論的コードに委譲

import type { ExtractedInvoice, JournalEntry, KnowledgeEntry, KnowledgeStore } from "../types.ts";
import { getAccountName, getValidAccountCodes } from "../harness/checker.ts";
import { buildJournalEntry } from "../deterministic/rules.ts";
import { getBestMapping } from "../knowledge/store.ts";

const MOCK_CONFIDENCE = 0.85;
const HIGH_CONFIDENCE = 0.95;
const DEFAULT_TAX_RATE = 0.1;
const FIRST_CAPTURE = 1;
const SINGLE_QUANTITY = 1;
const ZERO_AMOUNT = 0;
const MAX_TOKENS = 2048;

interface AgentConfig {
  apiKey?: string;
  useMock: boolean;
}

/* eslint-disable typescript/no-unsafe-assignment, typescript/no-unsafe-member-access, typescript/strict-boolean-expressions -- process.env lacks types in this prototype */
const createConfig = (): AgentConfig => ({
  apiKey: process.env["ANTHROPIC_API_KEY"],
  useMock: process.env["INVOICE_FORGE_MOCK_AI"] === "true" || !process.env["ANTHROPIC_API_KEY"],
});
/* eslint-enable typescript/no-unsafe-assignment, typescript/no-unsafe-member-access, typescript/strict-boolean-expressions */

const extractWithAI = async (rawText: string, apiKey: string): Promise<ExtractedInvoice> => {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    max_tokens: MAX_TOKENS,
    messages: [
      {
        content: `以下の請求書テキストから情報を抽出し、JSON形式で返してください。
JSONのみを返し、マークダウンのコードブロックや説明文は含めないでください。

必要なフィールド:
- vendorName: 取引先名（string）
- invoiceNumber: 請求書番号（string）
- invoiceDate: 請求日（YYYY-MM-DD形式のstring）
- items: 明細行の配列（各要素: { description: string, quantity: number, unitPrice: number, amount: number }）
- subtotal: 小計（number）
- taxRate: 税率（0.1 = 10%のようなnumber）
- taxAmount: 税額（number）
- totalAmount: 合計金額（number）
- qualifiedInvoiceNumber: 適格請求書発行事業者番号（T+13桁、あれば）

請求書テキスト:
${rawText}`,
        role: "user",
      },
    ],
    model: "claude-sonnet-4-20250514",
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("AIからテキスト応答を取得できませんでした");
  }

  return JSON.parse(textBlock.text) as ExtractedInvoice; // eslint-disable-line typescript/no-unsafe-type-assertion -- runtime validation out of scope for prototype
};

const parseAmount = (match: RegExpMatchArray | null): number =>
  // eslint-disable-line no-null/no-null
  match ? Number(match[FIRST_CAPTURE].replaceAll(",", "")) : ZERO_AMOUNT;

interface InvoiceMatches {
  vendorMatch: RegExpMatchArray | null; // eslint-disable-line no-null/no-null
  numberMatch: RegExpMatchArray | null; // eslint-disable-line no-null/no-null
  dateMatch: RegExpMatchArray | null; // eslint-disable-line no-null/no-null
  totalMatch: RegExpMatchArray | null; // eslint-disable-line no-null/no-null
  taxMatch: RegExpMatchArray | null; // eslint-disable-line no-null/no-null
  subtotalMatch: RegExpMatchArray | null; // eslint-disable-line no-null/no-null
  qualifiedMatch: RegExpMatchArray | null; // eslint-disable-line no-null/no-null
}

const matchInvoiceFields = (rawText: string): InvoiceMatches => ({
  dateMatch: rawText.match(/(?:請求日|日付)[：:]\s*(\d{4}[-/]\d{1,2}[-/]\d{1,2})/u),
  numberMatch: rawText.match(/(?:請求書番号|No\.?)[：:]\s*(.+)/u),
  qualifiedMatch: rawText.match(/(T\d{13})/u),
  subtotalMatch: rawText.match(/(?:小計|税抜)[：:]\s*[¥￥]?([\d,]+)/u),
  taxMatch: rawText.match(/(?:消費税|税額)[：:]\s*[¥￥]?([\d,]+)/u),
  totalMatch: rawText.match(/(?:合計|総額)[：:]\s*[¥￥]?([\d,]+)/u),
  vendorMatch: rawText.match(/(?:取引先|請求元|会社名)[：:]\s*(.+)/u),
});

const buildMockInvoice = (rawText: string, matches: InvoiceMatches): ExtractedInvoice => {
  const lines = rawText.split("\n").filter((line) => line.trim());
  const totalAmount = parseAmount(matches.totalMatch);
  const taxAmount = parseAmount(matches.taxMatch);
  const subtotal = parseAmount(matches.subtotalMatch) || totalAmount - taxAmount;

  return {
    invoiceDate: matches.dateMatch?.[FIRST_CAPTURE]?.replaceAll("/", "-") ?? "2026-01-01",
    invoiceNumber: matches.numberMatch?.[FIRST_CAPTURE]?.trim() ?? "UNKNOWN",
    items: [
      {
        amount: subtotal,
        description:
          lines
            .find((ln) => ln.includes("品目"))
            ?.replace(/品目[：:]/, "")
            .trim() ?? "一式",
        quantity: SINGLE_QUANTITY,
        unitPrice: subtotal,
      },
    ],
    qualifiedInvoiceNumber: matches.qualifiedMatch?.[FIRST_CAPTURE],
    subtotal,
    taxAmount,
    taxRate: DEFAULT_TAX_RATE,
    totalAmount,
    vendorName: matches.vendorMatch?.[FIRST_CAPTURE]?.trim() ?? "不明",
  };
};

const extractWithMock = async (rawText: string): Promise<ExtractedInvoice> => {
  const matches = matchInvoiceFields(rawText);
  const invoice = buildMockInvoice(rawText, matches);
  await Promise.resolve();
  return invoice;
};

const extractInvoice = async (rawText: string, config: AgentConfig): Promise<ExtractedInvoice> => {
  if (config.useMock) {
    const result = await extractWithMock(rawText);
    return result;
  }
  const apiKey = config.apiKey ?? "";
  const result = await extractWithAI(rawText, apiKey);
  return result;
};

const inferAccountFromDescription = (extracted: ExtractedInvoice): string => {
  const text =
    `${extracted.vendorName} ${extracted.items.map((item) => item.description).join(" ")}`.toLowerCase();
  const validCodes = getValidAccountCodes();

  const patterns: [RegExp, string][] = [
    [/通信|電話|インターネット|回線/u, "632"],
    [/事務|文具|コピー/u, "634"],
    [/電気|ガス|水道|光熱/u, "635"],
    [/広告|宣伝|マーケティング/u, "636"],
    [/交際|接待|会食/u, "637"],
    [/家賃|賃料|オフィス/u, "638"],
    [/交通|タクシー|新幹線|飛行機/u, "631"],
    [/外注|委託|開発/u, "643"],
    [/消耗|備品/u, "633"],
    [/手数料|振込/u, "642"],
    [/保険/u, "639"],
    [/リース|レンタル/u, "644"],
    [/修繕|修理|メンテナンス/u, "645"],
  ];

  for (const [pattern, code] of patterns) {
    if (pattern.test(text) && validCodes[code]) {
      return code;
    }
  }

  return "646";
};

const resolveAccountMapping = (
  extracted: ExtractedInvoice,
  knowledgeHints: KnowledgeEntry[],
  knowledgeStore: KnowledgeStore,
): { code: string; confidence: number } => {
  const bestMapping = getBestMapping(knowledgeStore, extracted.vendorName);
  if (bestMapping) {
    return { code: bestMapping.accountCode, confidence: HIGH_CONFIDENCE };
  }
  if (knowledgeHints.length > ZERO_AMOUNT) {
    const [hint] = knowledgeHints;
    return { code: hint.accountCode, confidence: MOCK_CONFIDENCE };
  }
  return { code: inferAccountFromDescription(extracted), confidence: MOCK_CONFIDENCE };
};

const classifyAccount = async (
  extracted: ExtractedInvoice,
  knowledgeHints: KnowledgeEntry[],
  knowledgeStore: KnowledgeStore,
): Promise<JournalEntry> => {
  const mapping = resolveAccountMapping(extracted, knowledgeHints, knowledgeStore);
  const journal = buildJournalEntry(extracted, mapping.code, mapping.confidence);
  const result = await Promise.resolve(journal);
  return result;
};

export { createConfig, extractInvoice, classifyAccount, getAccountName };
