/**
 * AIエージェント層: 請求書情報抽出
 *
 * なぜAIを使うか:
 * 請求書のフォーマットは取引先ごとに異なり、ルールベースでの完全対応は困難。
 * AIの強みは「非定型テキストからの構造化データ抽出」と「パターン認識」。
 *
 * なぜモックモードがあるか:
 * プロトタイプのデモ時にAPI KEYがなくても動作確認できるようにするため。
 * モックモードでは決定論的に結果を返し、ハーネスの動作検証に集中できる。
 *
 * 本番ではextractWithAIをClaude API呼び出しに差し替える。
 * SDKのビルド依存を避けるため、プロトタイプではモックのみ提供。
 */

import type { ExtractedInvoice, RawInvoice } from "../types.ts";

const HIGH_CONFIDENCE = 0.95;
const DEFAULT_TAX_RATE = 0.1;

const VENDOR_ALIASES: Record<string, string> = {
  "(株)ACME": "vendor-acme",
  "ACME Corp": "vendor-acme",
  テスト商事株式会社: "vendor-test-corp",
  株式会社ACME: "vendor-acme",
};

const CATEGORY_MAP: Record<string, string> = {
  SaaS月額利用料: "ソフトウェア",
  クラウドライセンス: "ソフトウェア",
  コピー用紙: "事務用品",
  コンサルティング報酬: "コンサルティング",
  ボールペン: "事務用品",
  業務委託費: "コンサルティング",
};

/**
 * モックモードでの情報抽出
 * 既知の取引先名→IDマッピングと品目→カテゴリマッピングを使い、
 * 決定論的にデータを変換する。ハーネスの動作検証用。
 */
const extractMock = (invoice: RawInvoice): ExtractedInvoice => {
  const vendorId = VENDOR_ALIASES[invoice.vendorName] ?? null;
  const lineItems = invoice.lineItems.map((item) => ({
    amount: item.amount,
    category: CATEGORY_MAP[item.description] ?? "未分類",
    description: item.description,
    quantity: item.quantity,
    taxRate: item.taxRate || DEFAULT_TAX_RATE,
    unitPrice: item.unitPrice,
  }));

  return {
    anomalies: [],
    confidence: HIGH_CONFIDENCE,
    dueDate: invoice.dueDate,
    invoiceDate: invoice.invoiceDate,
    invoiceId: invoice.id,
    lineItems,
    subtotal: invoice.subtotal,
    taxAmount: invoice.taxAmount,
    totalAmount: invoice.totalAmount,
    vendorId,
    vendorName: invoice.vendorName,
  };
};

/**
 * 請求書情報抽出のエントリポイント
 * プロトタイプではモックモードのみ提供。
 * 本番ではClaude API呼び出しに差し替える。
 */
const extractInvoice = (invoice: RawInvoice): ExtractedInvoice => extractMock(invoice);

export { extractInvoice, extractMock };
