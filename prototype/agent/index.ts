/*
 * AIエージェント層: 請求書データの抽出と勘定科目推定
 *
 * 本番ではClaude APIを呼び出すが、プロトタイプではモックで実装。
 * AIが担うのは「推論のアップサイドが大きく、ミスのダウンサイドが小さい」部分:
 * - 非定型フォーマットの項目抽出
 * - 取引内容からの勘定科目推定
 * ハーネスが品質を保証するため、AIのミスは後工程で検出・修正される。
 */

import type { ExtractedData, KnowledgeEntry, RawInvoice } from "../types.ts";

const HIGH_CONFIDENCE = 0.95;
const MEDIUM_CONFIDENCE = 0.85;
const LOW_CONFIDENCE = 0.65;

/**
 * 取引内容から勘定科目を推定するデフォルトマッピング
 * プロトタイプではキーワードマッチ、本番ではClaude APIによる推論
 */
const DEFAULT_ACCOUNT_MAP: Record<string, string> = {
  AWS: "通信費",
  オフィス: "地代家賃",
  クラウド: "通信費",
  コピー用紙: "消耗品費",
  サーバー: "通信費",
  タクシー: "旅費交通費",
  デザイン: "外注費",
  トナー: "消耗品費",
  ホスティング: "通信費",
  マーケティング: "広告宣伝費",
  会食: "接待交際費",
  出張: "旅費交通費",
  家賃: "地代家賃",
  広告: "広告宣伝費",
  振込手数料: "支払手数料",
  文房具: "消耗品費",
  新幹線: "旅費交通費",
  水道: "水道光熱費",
  贈答: "接待交際費",
  開発委託: "外注費",
  電気: "水道光熱費",
};

/**
 * ナレッジストアを参照して勘定科目を推定
 * ナレッジに既知のマッピングがあれば高信頼度で返す
 */
const estimateAccountFromKnowledge = (
  vendor: string,
  description: string,
  knowledge: KnowledgeEntry[],
): { account: string; confidence: number } | null => {
  const match = knowledge.find(
    (entry) => entry.vendor === vendor && description.includes(entry.description),
  );
  if (match) {
    return { account: match.account, confidence: HIGH_CONFIDENCE };
  }
  return null;
};

/**
 * キーワードマッチで勘定科目を推定（フォールバック）
 */
const estimateAccountFromKeywords = (
  description: string,
): { account: string; confidence: number } => {
  for (const keyword of Object.keys(DEFAULT_ACCOUNT_MAP)) {
    if (description.includes(keyword)) {
      return { account: DEFAULT_ACCOUNT_MAP[keyword], confidence: MEDIUM_CONFIDENCE };
    }
  }
  return { account: "雑費", confidence: LOW_CONFIDENCE };
};

/**
 * 請求書データを抽出し、構造化データに変換する
 * プロトタイプでは入力がJSON形式なので「抽出」はシンプルだが、
 * 本番ではOCR結果やPDFからの非定型データ解析をAIが担う
 */
const extractInvoiceData = (invoice: RawInvoice, knowledge: KnowledgeEntry[]): ExtractedData => {
  const items = invoice.items.map((item) => {
    const knowledgeResult = estimateAccountFromKnowledge(
      invoice.vendor,
      item.description,
      knowledge,
    );
    const accountResult = knowledgeResult ?? estimateAccountFromKeywords(item.description);

    return {
      accountConfidence: accountResult.confidence,
      amount: item.quantity * item.unitPrice,
      description: item.description,
      quantity: item.quantity,
      suggestedAccount: accountResult.account,
      taxRate: item.taxRate,
      unitPrice: item.unitPrice,
    };
  });

  return {
    confidence: HIGH_CONFIDENCE,
    date: invoice.date,
    invoiceNumber: invoice.invoiceNumber,
    items,
    taxAmount: invoice.taxAmount,
    totalAmount: invoice.totalAmount,
    vendor: invoice.vendor,
  };
};

export { extractInvoiceData };
