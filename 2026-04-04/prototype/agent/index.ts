/**
 * AIエージェント層 — 請求書情報抽出・勘定科目分類
 *
 * プロトタイプではパターンマッチによる簡易抽出を行う。
 * 本番環境では Claude API に差し替える。
 */

import type { AccountClassification, ExtractedInvoiceData } from "../types.ts";
import { findRule } from "../knowledge/store.ts";

const KNOWLEDGE_CONFIDENCE = 0.95;
const AI_EXTRACTION_CONFIDENCE = 0.88;
const AI_CLASSIFICATION_CONFIDENCE = 0.82;
const CREDIT_CODE = "2100";
const CREDIT_NAME = "買掛金";
const FIRST_MATCH = 0;
const TAX_RATE = 0.1;
const DEFAULT_AMOUNT = 10_000;
const RADIX = 10;
const DEFAULT_DATE = "2026-04-01";
const DEFAULT_VENDOR = "不明な取引先";
const DEFAULT_INVOICE_NUM = "UNKNOWN";
const QUANTITY_ONE = 1;

/** 金額文字列をパースする */
const parseAmount = (match: RegExpMatchArray | null): number => {
  if (match === null) {
    return DEFAULT_AMOUNT;
  }
  const COMMA_PATTERN = /,/g;
  return Number.parseInt(match[FIRST_MATCH].replace(COMMA_PATTERN, ""), RADIX) || DEFAULT_AMOUNT;
};

/** パターンマッチによる請求書データ抽出 */
const extractInvoiceData = (text: string): ExtractedInvoiceData => {
  const dateMatch = text.match(/(\d{4}[-/]\d{1,2}[-/]\d{1,2})/);
  const amountMatch = text.match(/合計[^\d]*(\d[\d,]+)/);
  const vendorMatch = text.match(/(?:株式会社|有限会社|合同会社)\S+/);
  const invoiceMatch = text.match(/(?:請求番号|No\.|#)\s*(\S+)/);
  const amount = parseAmount(amountMatch);
  const tax = Math.floor(amount * TAX_RATE);
  return {
    confidenceScore: AI_EXTRACTION_CONFIDENCE,
    dueDate: null,
    invoiceDate: dateMatch === null ? DEFAULT_DATE : dateMatch[FIRST_MATCH].replaceAll("/", "-"),
    invoiceNumber: invoiceMatch === null ? DEFAULT_INVOICE_NUM : invoiceMatch[FIRST_MATCH],
    lineItems: [
      {
        amount,
        description: "明細",
        isReducedTaxRate: false,
        quantity: QUANTITY_ONE,
        unitPrice: amount,
      },
    ],
    subtotal: amount,
    taxAmount: tax,
    totalAmount: amount + tax,
    vendorName: vendorMatch === null ? DEFAULT_VENDOR : vendorMatch[FIRST_MATCH],
  };
};

/** ナレッジストアを参照した勘定科目分類 */
const classifyWithKnowledge = (extracted: ExtractedInvoiceData): AccountClassification | null => {
  const description = extracted.lineItems.map((item) => item.description).join(" ");
  const rule = findRule(extracted.vendorName, description);
  if (rule === null) {
    return null;
  }
  return {
    confidence: KNOWLEDGE_CONFIDENCE,
    creditAccountCode: CREDIT_CODE,
    creditAccountName: CREDIT_NAME,
    debitAccountCode: rule.accountCode,
    debitAccountName: rule.accountName,
    reasoning: `ナレッジストアのルールに基づく（利用回数: ${rule.occurrences}）`,
  };
};

/** デフォルトの勘定科目分類（フォールバック） */
const classifyDefault = (extracted: ExtractedInvoiceData): AccountClassification => ({
  confidence: AI_CLASSIFICATION_CONFIDENCE,
  creditAccountCode: CREDIT_CODE,
  creditAccountName: CREDIT_NAME,
  debitAccountCode: "6510",
  debitAccountName: "消耗品費",
  reasoning: `取引先「${extracted.vendorName}」のデフォルト分類`,
});

/** 勘定科目を分類する（ナレッジストア優先） */
const classifyAccount = (extracted: ExtractedInvoiceData): AccountClassification => {
  const knowledgeResult = classifyWithKnowledge(extracted);
  if (knowledgeResult !== null) {
    return knowledgeResult;
  }
  return classifyDefault(extracted);
};

export { extractInvoiceData, classifyAccount, classifyWithKnowledge };
