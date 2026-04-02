/**
 * AIエージェント層: 請求書情報抽出 & 仕訳推定
 *
 * なぜAIを使うか:
 * 請求書のフォーマットは取引先ごとに異なり、ルールベースでの抽出は困難。
 * AIの自然言語理解能力を使って、非定型テキストから構造化データを抽出する。
 * ただし、AIの出力は「推定」であり、ハーネスが外部からバリデーションを行う。
 *
 * なぜ独自インターフェースを使うか:
 * Anthropic SDKの型をリンター環境で解決できないため、
 * AI呼び出しを抽象化した関数型を定義し、デモ層でSDKとバインドする。
 */

import type { InvoiceData, JournalEntry, LineItem } from "../harness/types.js";
import { ACCOUNT_MASTER } from "../deterministic/rules.js";
import type { KnowledgeStore } from "../knowledge/store.js";

const DEFAULT_CONFIDENCE = 0.5;
const HIGH_CONFIDENCE_BONUS = 0.3;
const STANDARD_TAX_RATE = 0.1;
const EMPTY_COUNT = 0;
const PAYABLE_CODE = "2100";
const PAYABLE_NAME = "買掛金";
const UNKNOWN_VENDOR = "不明";
const FIRST_MATCH_INDEX = 0;

/** AI呼び出しの抽象化: プロンプトを送りテキストレスポンスを返す */
type AiCallFn = (prompt: string) => Promise<string>;

/** AIレスポンスからJSON文字列を抽出する */
const extractJsonString = (text: string): string => {
  const jsonMatch = text.match(/\{[\s\S]*\}/u);
  if (jsonMatch === null) {
    throw new Error("AIからのレスポンスにJSONが含まれていません");
  }
  return jsonMatch[FIRST_MATCH_INDEX];
};

/** ランタイム型ガード: InvoiceData の最低限の構造チェック */
const isInvoiceData = (value: unknown): value is InvoiceData =>
  typeof value === "object" && value !== null && "lineItems" in value && "totalAmount" in value;

/** ランタイム型ガード: 勘定科目推定結果の構造チェック */
const isAccountEstimate = (value: unknown): value is { accountCode: string; accountName: string } =>
  typeof value === "object" && value !== null && "accountCode" in value && "accountName" in value;

/** AIレスポンスからInvoiceDataを抽出する */
const parseInvoiceResponse = (text: string): InvoiceData => {
  const raw: unknown = JSON.parse(extractJsonString(text));
  if (!isInvoiceData(raw)) {
    throw new Error("AIレスポンスがInvoiceData形式ではありません");
  }
  return raw;
};

/** AIレスポンスから勘定科目を抽出する */
const parseAccountResponse = (text: string): { accountCode: string; accountName: string } => {
  const raw: unknown = JSON.parse(extractJsonString(text));
  if (!isAccountEstimate(raw)) {
    throw new Error("AIレスポンスが勘定科目形式ではありません");
  }
  return raw;
};

interface JournalEntryInput {
  item: LineItem;
  vendor: string;
  debitCode: string;
  debitName: string;
}

/** 品目から仕訳エントリを構築する共通ヘルパー */
const buildJournalEntry = (input: JournalEntryInput): JournalEntry => ({
  amount: input.item.amount,
  creditAccountCode: PAYABLE_CODE,
  creditAccountName: PAYABLE_NAME,
  debitAccountCode: input.debitCode,
  debitAccountName: input.debitName,
  description: `${input.vendor} - ${input.item.description}`,
  taxCategory: input.item.taxRate === STANDARD_TAX_RATE ? "課税仕入10%" : "課税仕入8%",
});

/**
 * 請求書テキストからフィールドを抽出する
 * ハーネスのafterExtractionフックで品質チェックされる前提
 */
const extractInvoiceData = async (callAi: AiCallFn, invoiceText: string): Promise<InvoiceData> => {
  const prompt = `以下の請求書テキストから情報を抽出し、JSON形式で返してください。

請求書テキスト:
${invoiceText}

以下のJSON形式で返してください（値がない場合はnull）:
{
  "invoiceNumber": "請求書番号",
  "vendor": "発行元（取引先名）",
  "issueDate": "YYYY-MM-DD",
  "dueDate": "YYYY-MM-DD or null",
  "lineItems": [
    {
      "description": "品目名",
      "quantity": 1,
      "unitPrice": 10000,
      "amount": 10000,
      "taxRate": 0.10
    }
  ],
  "subtotal": 10000,
  "taxAmount": 1000,
  "totalAmount": 11000,
  "registrationNumber": "T1234567890123 or null"
}

JSONのみを返し、それ以外のテキストは含めないでください。`;

  const responseText = await callAi(prompt);
  return parseInvoiceResponse(responseText);
};

interface EstimateSingleInput {
  callAi: AiCallFn;
  item: LineItem;
  vendor: string;
  accountMasterText: string;
}

/** AIで単一品目の勘定科目を推定する */
const estimateSingleItem = async (input: EstimateSingleInput): Promise<JournalEntry> => {
  const prompt = `以下の品目に最適な借方勘定科目を選んでください。

取引先: ${input.vendor}
品目: ${input.item.description}
金額: ${input.item.amount}円

利用可能な勘定科目:
${input.accountMasterText}

以下のJSON形式で返してください:
{"accountCode": "5300", "accountName": "消耗品費"}

JSONのみを返してください。`;

  const responseText = await input.callAi(prompt);
  const estimated = parseAccountResponse(responseText);

  return buildJournalEntry({
    debitCode: estimated.accountCode,
    debitName: estimated.accountName,
    item: input.item,
    vendor: input.vendor,
  });
};

/**
 * 抽出済みの請求書データから仕訳を推定する
 * ナレッジストアに既存マッピングがあればそれを優先し、なければAIが推定
 */
const estimateJournalEntries = async (
  callAi: AiCallFn,
  invoice: InvoiceData,
  knowledgeStore: KnowledgeStore,
): Promise<{ confidence: number; entries: JournalEntry[] }> => {
  const vendor = invoice.vendor ?? UNKNOWN_VENDOR;
  const accountMasterText = Object.entries(ACCOUNT_MASTER)
    .map(([code, name]) => `${code}: ${name}`)
    .join("\n");

  const resolveItem = async (
    item: LineItem,
  ): Promise<{ entry: JournalEntry; fromKnowledge: boolean }> => {
    const knownMapping = knowledgeStore.findMapping(vendor, item.description);
    if (knownMapping !== null) {
      const entry = buildJournalEntry({
        debitCode: knownMapping.accountCode,
        debitName: knownMapping.accountName,
        item,
        vendor,
      });
      return { entry, fromKnowledge: true };
    }
    const entry = await estimateSingleItem({ accountMasterText, callAi, item, vendor });
    return { entry, fromKnowledge: false };
  };

  const results = await Promise.all(invoice.lineItems.map(resolveItem));
  const entries = results.map((result) => result.entry);
  const knowledgeHits = results.filter((result) => result.fromKnowledge).length;

  let totalConfidence = DEFAULT_CONFIDENCE;
  if (invoice.lineItems.length > EMPTY_COUNT) {
    totalConfidence =
      DEFAULT_CONFIDENCE + (knowledgeHits / invoice.lineItems.length) * HIGH_CONFIDENCE_BONUS;
  }

  return { confidence: totalConfidence, entries };
};

export { estimateJournalEntries, extractInvoiceData };
export type { AiCallFn };
