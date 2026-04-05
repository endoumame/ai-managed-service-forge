/**
 * Agent/index.ts — AIエージェント層
 *
 * なぜこの実装か:
 * AIエージェントは「推論のアップサイドが大きく、ミスのダウンサイドが小さい」部分のみを担当する。
 * 具体的には: 非定型データからの情報抽出、勘定科目の推定、異常検知。
 * 抽出結果はハーネス層で必ず外部検証されるため、AIの誤りは必ず検出される。
 *
 * プロトタイプではモックモード（JSON直接パース）で動作する。
 * 本番ではClaude APIを使用して非定型PDF/画像からの抽出を行う。
 */

import type { ExtractedInvoice } from "../types.ts";

const ZERO = 0;
const CONFIDENCE_HIGH = 0.95;
const CONFIDENCE_MEDIUM = 0.85;
const DUPLICATE_THRESHOLD = 0;
const AMOUNT_MULTIPLIER = 3;

/** Unknownオブジェクトからstring型プロパティを安全に取得 */
const getString = (obj: object, key: string): string => {
  const val: unknown = Reflect.get(obj, key);
  return typeof val === "string" ? val : "";
};

/** Unknownオブジェクトからnumber型プロパティを安全に取得 */
const getNumber = (obj: object, key: string): number => {
  const val: unknown = Reflect.get(obj, key);
  return typeof val === "number" ? val : ZERO;
};

/** Unknownオブジェクトから配列プロパティを安全に取得 */
const getArray = (obj: object, key: string): unknown[] => {
  const val: unknown = Reflect.get(obj, key);
  return Array.isArray(val) ? val : [];
};

/** パースされたオブジェクトからExtractedInvoiceを構築する */
const buildExtractedInvoice = (parsed: unknown): ExtractedInvoice => {
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Invalid invoice data: not an object");
  }
  return {
    confidence: getNumber(parsed, "confidence"),
    invoiceDate: getString(parsed, "invoiceDate"),
    invoiceNumber: getString(parsed, "invoiceNumber"),
    lineItems: getArray(parsed, "lineItems").map((item) => {
      if (typeof item !== "object" || item === null) {
        return { amount: ZERO, description: "", quantity: ZERO, unitPrice: ZERO };
      }
      return {
        amount: getNumber(item, "amount"),
        description: getString(item, "description"),
        quantity: getNumber(item, "quantity"),
        unitPrice: getNumber(item, "unitPrice"),
      };
    }),
    subtotalAmount: getNumber(parsed, "subtotalAmount"),
    taxAmount: getNumber(parsed, "taxAmount"),
    taxRate: getNumber(parsed, "taxRate"),
    totalAmount: getNumber(parsed, "totalAmount"),
    vendorName: getString(parsed, "vendorName"),
  };
};

/**
 * 請求書から情報を抽出するエージェント
 * プロトタイプではJSON入力を直接パースする（本番ではClaude APIマルチモーダル抽出）
 */
const extractInvoice = (invoiceContent: string): ExtractedInvoice =>
  buildExtractedInvoice(JSON.parse(invoiceContent));

/**
 * 勘定科目をAIで推定する（ナレッジベースにない場合のフォールバック）
 * プロトタイプではシンプルなキーワードマッチングで代替
 */
const suggestAccount = (
  description: string,
): { code: string; name: string; confidence: number } => {
  const keywordMap: Record<string, { code: string; name: string }> = {
    コピー: { code: "5300", name: "消耗品費" },
    サーバ: { code: "5400", name: "通信費" },
    タクシー: { code: "5500", name: "旅費交通費" },
    交通: { code: "5500", name: "旅費交���費" },
    光熱: { code: "5700", name: "水道光熱費" },
    家賃: { code: "5800", name: "地代家���" },
    広告: { code: "5600", name: "広��宣伝費" },
    文具: { code: "5300", name: "消耗品費" },
    電気: { code: "5700", name: "水道光熱費" },
  };

  for (const [keyword, account] of Object.entries(keywordMap)) {
    if (description.includes(keyword)) {
      return { ...account, confidence: CONFIDENCE_MEDIUM };
    }
  }

  return { code: "5900", confidence: CONFIDENCE_HIGH, name: "雑費" };
};

/** 重複請求チェック */
const checkDuplicateInvoice = (
  invoice: ExtractedInvoice,
  history: ExtractedInvoice[],
): string[] => {
  const duplicates = history.filter(
    (hi) => hi.invoiceNumber === invoice.invoiceNumber && hi.vendorName === invoice.vendorName,
  );
  if (duplicates.length > DUPLICATE_THRESHOLD) {
    return [`重複請求の可能性: 請求番号 ${invoice.invoiceNumber} は既に処理済み`];
  }
  return [];
};

/** 金額異常チェック */
const checkAmountAnomaly = (invoice: ExtractedInvoice, history: ExtractedInvoice[]): string[] => {
  const sameVendor = history.filter((hi) => hi.vendorName === invoice.vendorName);
  if (sameVendor.length <= ZERO) {
    return [];
  }
  const avgAmount = sameVendor.reduce((sum, hi) => sum + hi.totalAmount, ZERO) / sameVendor.length;
  if (invoice.totalAmount > avgAmount * AMOUNT_MULTIPLIER) {
    return [
      `金額異常: ${invoice.vendorName}の平均(${Math.round(avgAmount)}円)の${AMOUNT_MULTIPLIER}倍超`,
    ];
  }
  return [];
};

/**
 * 異常検知: 過去の請求パターンと比較して異常を検出
 */
const detectAnomalies = (invoice: ExtractedInvoice, history: ExtractedInvoice[]): string[] => [
  ...checkDuplicateInvoice(invoice, history),
  ...checkAmountAnomaly(invoice, history),
];

export { detectAnomalies, extractInvoice, suggestAccount };
