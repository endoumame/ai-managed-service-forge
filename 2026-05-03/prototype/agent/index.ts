// AIエージェント層: 推論アップサイドが大きい処理を担当
// テキスト理解・分類・異常判断に限定し、金額計算は決定論的コードに委譲

import type { ExtractedData, ExtractedItem, KnowledgeEntry, RawInvoice } from "../types.ts";

const ZERO = 0;
const HIGH_CONFIDENCE = 0.95;
const MEDIUM_CONFIDENCE = 0.7;
const MAX_TOKENS = 1024;
const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const MODEL_ID = "claude-sonnet-4-20250514";

interface ExtractionResult {
  data: ExtractedData;
  usedMock: boolean;
}

const EXTRACTION_SYSTEM_PROMPT = `あなたは請求書データ抽出の専門家です。
与えられた請求書データからJSON形式で情報を抽出してください。
各項目に対して適切な勘定科目コードと名称を推定してください。

勘定科目の例:
- 6100: 消耗品費（文房具、コピー用紙等）
- 6200: 通信費（インターネット、電話等）
- 6300: 水道光熱費
- 6400: 旅費交通費
- 6500: 接待交際費
- 6600: 会議費（会議用の飲食等）
- 6700: 外注費（業務委託等）
- 6800: 支払手数料
- 6900: 広告宣伝費
- 7000: 賃借料（サーバー、クラウド利用料等）
- 7100: 修繕費
- 7200: 業務委託費（コンサルティング等）

回答はJSON形式のみで、説明文は不要です。`;

interface AgentResponseItem {
  description: string;
  accountCode: string;
  accountName: string;
  confidence: number;
}

interface AgentResponse {
  vendorNormalized: string;
  items: AgentResponseItem[];
  overallConfidence: number;
}

const isAgentResponse = (value: unknown): value is AgentResponse => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return (
    "vendorNormalized" in value &&
    "items" in value &&
    "overallConfidence" in value &&
    typeof value.vendorNormalized === "string" &&
    Array.isArray(value.items) &&
    typeof value.overallConfidence === "number"
  );
};

interface ApiTextBlock {
  type: "text";
  text: string;
}

interface ApiResponse {
  content: ApiTextBlock[];
}

const isApiResponse = (value: unknown): value is ApiResponse => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return "content" in value && Array.isArray(value.content);
};

const parseAgentResponse = (text: string): AgentResponse => {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch === null) {
    throw new Error("AIレスポンスからJSONを抽出できませんでした");
  }
  const parsed: unknown = JSON.parse(jsonMatch[ZERO]);
  if (!isAgentResponse(parsed)) {
    throw new Error("AIレスポンスが期待するスキーマと一致しません");
  }
  return parsed;
};

const buildExtractionPrompt = (invoice: RawInvoice, knowledge: KnowledgeEntry[]): string => {
  const knowledgeHint =
    knowledge.length > ZERO
      ? `\n過去の仕訳パターン:\n${knowledge.map((ke) => `- ${ke.vendorName}: ${ke.pattern.accountName}(${ke.pattern.accountCode})`).join("\n")}`
      : "";

  return `以下の請求書データから情報を抽出し、勘定科目を推定してください。${knowledgeHint}

請求書データ:
取引先: ${invoice.vendor}
請求番号: ${invoice.invoiceNumber}
日付: ${invoice.date}
支払期日: ${invoice.dueDate}
品目:
${invoice.items.map((item) => `- ${item.description} (数量:${item.quantity}, 単価:${item.unitPrice}, 税率:${item.taxRate}, 金額:${item.amount})`).join("\n")}
小計: ${invoice.totalAmount - invoice.taxAmount}
税額: ${invoice.taxAmount}
合計: ${invoice.totalAmount}
備考: ${invoice.notes ?? "なし"}

以下のJSON形式で回答してください:
{
  "vendorNormalized": "正規化された取引先名",
  "items": [
    {
      "description": "品目名",
      "accountCode": "勘定科目コード",
      "accountName": "勘定科目名",
      "confidence": 0.0〜1.0
    }
  ],
  "overallConfidence": 0.0〜1.0
}`;
};

const fetchClaudeResponse = async (prompt: string, apiKey: string): Promise<ApiResponse> => {
  const response = await fetch(API_URL, {
    body: JSON.stringify({
      max_tokens: MAX_TOKENS,
      messages: [{ content: prompt, role: "user" }],
      model: MODEL_ID,
      system: EXTRACTION_SYSTEM_PROMPT,
    }),
    headers: {
      "anthropic-version": API_VERSION,
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${String(response.status)}`);
  }

  const body: unknown = await response.json();
  if (!isApiResponse(body)) {
    throw new Error("Claude APIレスポンスの形式が不正です");
  }
  return body;
};

const extractTextFromApiResponse = (apiResponse: ApiResponse): string => {
  const textBlocks = apiResponse.content.filter((block) => block.type === "text");
  if (textBlocks.length === ZERO) {
    throw new TypeError("AIレスポンスにテキストブロックがありません");
  }
  return textBlocks[ZERO].text;
};

const callClaudeApi = async (
  invoice: RawInvoice,
  knowledge: KnowledgeEntry[],
): Promise<AgentResponse> => {
  const prompt = buildExtractionPrompt(invoice, knowledge);
  const apiResponse = await fetchClaudeResponse(prompt);
  const text = extractTextFromApiResponse(apiResponse);
  return parseAgentResponse(text);
};

const buildMockResponse = (invoice: RawInvoice, knowledge: KnowledgeEntry[]): AgentResponse => {
  const knowledgeMap = new Map(knowledge.map((ke) => [ke.vendorName, ke]));
  const hasKnowledge = knowledgeMap.has(invoice.vendor);
  const known = knowledgeMap.get(invoice.vendor);
  const confidence = hasKnowledge ? HIGH_CONFIDENCE : MEDIUM_CONFIDENCE;

  return {
    items: invoice.items.map((item) => ({
      accountCode: known?.pattern.accountCode ?? "6100",
      accountName: known?.pattern.accountName ?? "消耗品費",
      confidence,
      description: item.description,
    })),
    overallConfidence: confidence,
    vendorNormalized: invoice.vendor,
  };
};

const mapToExtractedItems = (
  invoice: RawInvoice,
  agentItems: AgentResponseItem[],
): ExtractedItem[] =>
  invoice.items.map((original, idx) => ({
    accountCode: agentItems[idx]?.accountCode ?? "6100",
    accountName: agentItems[idx]?.accountName ?? "消耗品費",
    amount: original.amount,
    confidence: agentItems[idx]?.confidence ?? MEDIUM_CONFIDENCE,
    description: original.description,
    quantity: original.quantity,
    taxRate: original.taxRate,
    unitPrice: original.unitPrice,
  }));

interface ExtractionOptions {
  invoice: RawInvoice;
  knowledge: KnowledgeEntry[];
  useMock: boolean;
  apiKey?: string;
}

const buildExtractedData = (invoice: RawInvoice, agentResponse: AgentResponse): ExtractedData => ({
  confidence: agentResponse.overallConfidence,
  dueDate: invoice.dueDate,
  invoiceId: invoice.id,
  invoiceNumber: invoice.invoiceNumber,
  issueDate: invoice.date,
  items: mapToExtractedItems(invoice, agentResponse.items),
  subtotal: invoice.totalAmount - invoice.taxAmount,
  taxAmount: invoice.taxAmount,
  totalAmount: invoice.totalAmount,
  vendorName: invoice.vendor,
  vendorNormalized: agentResponse.vendorNormalized,
});

const extractInvoiceData = async (options: ExtractionOptions): Promise<ExtractionResult> => {
  const agentResponse = options.useMock
    ? buildMockResponse(options.invoice, options.knowledge)
    : await callClaudeApi(options.invoice, options.knowledge);

  return {
    data: buildExtractedData(options.invoice, agentResponse),
    usedMock: options.useMock,
  };
};

export { type ExtractionResult, extractInvoiceData };
