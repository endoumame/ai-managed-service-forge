/**
 * AIエージェント層: 推論処理
 *
 * 推論のアップサイドが大きく、ミスのダウンサイドが小さい処理を担当。
 * プロトタイプではClaude APIをモック化し、ルールベース＋キーワードマッチで
 * AI推論をシミュレートする。実運用ではここだけをAPI呼び出しに差し替える。
 */
import type {
  AccountMaster,
  ExtractedData,
  ExtractedLineItem,
  InvoiceInput,
  KnowledgeRule,
} from "../types.ts";

const CONFIDENCE_HIGH = 0.95;
const CONFIDENCE_MEDIUM = 0.75;
const CONFIDENCE_LOW = 0.5;
const NO_CONFIDENCE = 0;
const INITIAL_SUM = 0;
const DECIMAL_PLACES_NONE = 0;
const ANOMALY_HIGH_THRESHOLD = 2;
const ANOMALY_LOW_THRESHOLD = 0.3;
const PERCENTAGE_MULTIPLIER = 100;

interface ClassificationContext {
  accountMaster: AccountMaster[];
  knowledgeRules: KnowledgeRule[];
}

/**
 * 勘定科目の分類推論
 * 優先順位: (1)ナレッジルール完全一致 → (2)キーワードマッチ → (3)不明
 */
const classifyAccount = (
  description: string,
  vendor: string,
  context: ClassificationContext,
): { account: string; confidence: number } => {
  const vendorRule = context.knowledgeRules.find(
    (rule) => rule.vendor === vendor && description.includes(rule.pattern),
  );
  if (vendorRule) {
    return { account: vendorRule.account, confidence: CONFIDENCE_HIGH };
  }

  for (const master of context.accountMaster) {
    const matched = master.keywords.some((keyword) => description.includes(keyword));
    if (matched) {
      return { account: master.name, confidence: CONFIDENCE_MEDIUM };
    }
  }

  return { account: "未分類", confidence: CONFIDENCE_LOW };
};

/** 請求書データからの項目抽出（プロトタイプではパススルー＋科目推定） */
const extractInvoiceData = (
  invoice: InvoiceInput,
  context: ClassificationContext,
): ExtractedData => {
  const items: ExtractedLineItem[] = invoice.items.map((item) => {
    const { account, confidence } = classifyAccount(item.description, invoice.vendor, context);

    return {
      accountConfidence: confidence,
      amount: item.amount,
      description: item.description,
      quantity: item.quantity,
      suggestedAccount: account,
      taxRate: item.taxRate,
      unitPrice: item.unitPrice,
    };
  });

  const overallConfidence =
    items.length > INITIAL_SUM
      ? items.reduce((sum, item) => sum + item.accountConfidence, INITIAL_SUM) / items.length
      : NO_CONFIDENCE;

  return {
    confidence: overallConfidence,
    dueDate: invoice.dueDate,
    invoiceDate: invoice.invoiceDate,
    items,
    taxAmount: invoice.taxAmount,
    totalAmount: invoice.totalAmount,
    vendor: invoice.vendor,
  };
};

/** 異常取引の検知（過去平均との比較） */
const detectAnomalies = (
  vendor: string,
  totalAmount: number,
  vendorHistory: { averageAmount: number; invoiceCount: number } | undefined,
): string[] => {
  const anomalies: string[] = [];

  if (!vendorHistory) {
    anomalies.push(`新規取引先: ${vendor}（過去の取引履歴なし）`);
    return anomalies;
  }

  const deviationRatio = totalAmount / vendorHistory.averageAmount;
  if (deviationRatio > ANOMALY_HIGH_THRESHOLD) {
    anomalies.push(
      `金額異常: ${vendor}の今回請求額(${totalAmount.toLocaleString()}円)は過去平均(${vendorHistory.averageAmount.toLocaleString()}円)の${(deviationRatio * PERCENTAGE_MULTIPLIER).toFixed(DECIMAL_PLACES_NONE)}%`,
    );
  }

  if (deviationRatio < ANOMALY_LOW_THRESHOLD) {
    anomalies.push(
      `金額異常（過少）: ${vendor}の今回請求額(${totalAmount.toLocaleString()}円)は過去平均(${vendorHistory.averageAmount.toLocaleString()}円)の${(deviationRatio * PERCENTAGE_MULTIPLIER).toFixed(DECIMAL_PLACES_NONE)}%`,
    );
  }

  return anomalies;
};

export type { ClassificationContext };
export { classifyAccount, detectAnomalies, extractInvoiceData };
