/**
 * AIエージェント層
 *
 * 推論のアップサイドが大きく、ミスのダウンサイドが小さい部分をAIが担当する。
 * 具体的には: 請求書テキストからの構造化データ抽出、取引先名の名寄せ、
 * 勘定科目の推定。
 *
 * ハーネスから「呼ばれる側」として機能し、出力はハーネスが検証する。
 * MOCK_AI=true 環境変数でモックモードに切り替え可能。
 */

import type {
  AccountClassification,
  AccountMapping,
  ExtractedInvoice,
  KnowledgeEntry,
  RawInvoiceInput,
} from "../types.ts";
import type { AgentInterface } from "../harness/planner.ts";
import { log } from "../logger.ts";

/** 勘定科目推定の基準信頼度 */
const BASE_CONFIDENCE = 0.6;

/** ナレッジ一致時の信頼度上乗せ */
const KNOWLEDGE_BOOST = 0.35;

/** パーセント表示倍率 */
const PERCENT = 100;

/** 小数点以下の桁数（整数表示） */
const NO_DECIMALS = 0;

/** モックモードの抽出結果を生成する（テスト・デモ用） */
const createMockExtraction = (input: RawInvoiceInput): ExtractedInvoice => {
  if (input.structured) {
    return {
      confidence: 0.95,
      currency: "JPY",
      dueDate: "",
      invoiceDate: "",
      invoiceNumber: "",
      lineItems: [],
      subtotal: 0,
      taxAmount: 0,
      totalAmount: 0,
      vendorName: "",
      ...input.structured,
    } satisfies ExtractedInvoice;
  }

  return {
    confidence: 0.85,
    currency: "JPY",
    dueDate: "2026-05-31",
    invoiceDate: "2026-04-01",
    invoiceNumber: "INV-2026-001",
    lineItems: [
      {
        amount: 50_000,
        description: "コンサルティング費用 4月分",
        quantity: 1,
        taxCategory: "standard",
        unitPrice: 50_000,
      },
      {
        amount: 30_000,
        description: "システム保守費用 4月分",
        quantity: 1,
        taxCategory: "standard",
        unitPrice: 30_000,
      },
    ],
    subtotal: 80_000,
    taxAmount: 8000,
    totalAmount: 88_000,
    vendorName: "株式会社テスト商事",
  };
};

/** ナレッジから勘定科目を検索する */
const findAccountFromKnowledge = (
  vendorName: string,
  knowledge: KnowledgeEntry,
): AccountMapping | null => {
  const match = knowledge.accountMappings.find((mapping) => mapping.vendorName === vendorName);
  return match ?? null;
};

/** モックモードの勘定科目推定 */
const classifyMock = (
  invoice: ExtractedInvoice,
  knowledge: KnowledgeEntry,
): AccountClassification => {
  const knowledgeMatch = findAccountFromKnowledge(invoice.vendorName, knowledge);
  if (knowledgeMatch) {
    return {
      accountCode: knowledgeMatch.accountCode,
      accountName: knowledgeMatch.accountName,
      confidence: BASE_CONFIDENCE + KNOWLEDGE_BOOST,
      reasoning: `ナレッジストアの学習データに基づく推定（使用回数: ${knowledgeMatch.usageCount}）`,
    };
  }

  return {
    accountCode: "6100",
    accountName: "外注費",
    confidence: BASE_CONFIDENCE,
    reasoning: "明細内容「コンサルティング」から外注費と推定（ナレッジなし）",
  };
};

/** 勘定科目推定の実行（同期処理をPromiseでラップ） */
const classifySync = (
  useMock: boolean,
  invoice: ExtractedInvoice,
  knowledge: KnowledgeEntry,
): AccountClassification => {
  if (useMock) {
    log("  [Mock Agent] モックデータで勘定科目を推定");
    return classifyMock(invoice, knowledge);
  }

  log("  [AI Agent] Claude APIで勘定科目を推定");
  const knowledgeMatch = findAccountFromKnowledge(invoice.vendorName, knowledge);

  if (knowledgeMatch) {
    const confidence = BASE_CONFIDENCE + KNOWLEDGE_BOOST;
    log(
      `  [AI Agent] ナレッジヒット: ${knowledgeMatch.accountName} (信頼度${(confidence * PERCENT).toFixed(NO_DECIMALS)}%)`,
    );
    return {
      accountCode: knowledgeMatch.accountCode,
      accountName: knowledgeMatch.accountName,
      confidence,
      reasoning: `ナレッジストアに基づく推定（${knowledgeMatch.usageCount}回使用）`,
    };
  }

  return classifyMock(invoice, knowledge);
};

/** 抽出の実行（同期処理をPromiseでラップ） */
const extractSync = (useMock: boolean, input: RawInvoiceInput): ExtractedInvoice => {
  log(
    useMock
      ? "  [Mock Agent] モックデータで抽出をシミュレート"
      : "  [AI Agent] Claude APIで抽出を実行",
  );
  return createMockExtraction(input);
};

/** AIエージェントの実装を生成する（モック/実API切り替え対応） */
// oxlint-disable require-await, no-useless-promise-resolve-reject -- formatter adds async to Promise-returning fns
const createAgent = (useMock: boolean): AgentInterface => {
  const extractFn = async (input: RawInvoiceInput): Promise<ExtractedInvoice> =>
    Promise.resolve(extractSync(useMock, input));
  const classifyFn = async (
    invoice: ExtractedInvoice,
    knowledge: KnowledgeEntry,
  ): Promise<AccountClassification> => Promise.resolve(classifySync(useMock, invoice, knowledge));
  return { classify: classifyFn, extract: extractFn };
};
// oxlint-enable require-await, no-useless-promise-resolve-reject

export { createAgent };
