/**
 * デモ用サンプル請求書データ
 *
 * プロトタイプでは実際のOCR/PDFパーサーは使わず、
 * 構造化済みのJSONデータを入力として使う。
 * 各請求書は異なるシナリオ（正常、異常金額、重複疑い、新規取引先）を網羅する。
 */

import type { ClassificationRule, Invoice } from "../types.ts";
import type { VendorHistory } from "../harness/checker.ts";

/** サンプル請求書: 正常な月次サーバー費用 */
const invoiceNormal: Invoice = {
  currency: "JPY",
  dueDate: "2026-04-30",
  id: "INV-001",
  invoiceNumber: "2026-04-0001",
  invoiceRegistrationNumber: "T1234567890123",
  issueDate: "2026-04-01",
  items: [
    {
      amount: 50_000,
      description: "クラウドサーバー利用料（4月分）",
      quantity: 1,
      taxAmount: 5000,
      taxRate: 0.1,
      unitPrice: 50_000,
    },
  ],
  taxAmount: 5000,
  totalAmount: 55_000,
  vendor: "株式会社クラウドテック",
};

/** サンプル請求書: 金額が過去平均から大きく乖離 */
const invoiceHighDeviation: Invoice = {
  currency: "JPY",
  dueDate: "2026-04-30",
  id: "INV-002",
  invoiceNumber: "2026-04-0002",
  invoiceRegistrationNumber: "T9876543210123",
  issueDate: "2026-04-05",
  items: [
    {
      amount: 200_000,
      description: "コンサルティングサービス（特別プロジェクト）",
      quantity: 1,
      taxAmount: 20_000,
      taxRate: 0.1,
      unitPrice: 200_000,
    },
  ],
  taxAmount: 20_000,
  totalAmount: 220_000,
  vendor: "ABCコンサルティング",
};

/** サンプル請求書: 新規取引先（初めての取引） */
const invoiceNewVendor: Invoice = {
  currency: "JPY",
  dueDate: "2026-05-15",
  id: "INV-003",
  invoiceNumber: "D-2026-0042",
  invoiceRegistrationNumber: "T5555666677778",
  issueDate: "2026-04-08",
  items: [
    {
      amount: 80_000,
      description: "Webデザイン制作費",
      quantity: 1,
      taxAmount: 8000,
      taxRate: 0.1,
      unitPrice: 80_000,
    },
    {
      amount: 20_000,
      description: "ロゴデザイン制作費",
      quantity: 1,
      taxAmount: 2000,
      taxRate: 0.1,
      unitPrice: 20_000,
    },
  ],
  taxAmount: 10_000,
  totalAmount: 110_000,
  vendor: "デザインスタジオXYZ",
};

/** サンプル請求書: 重複疑い（INV-001と同一取引先・同一金額・近接日付） */
const invoiceDuplicate: Invoice = {
  currency: "JPY",
  dueDate: "2026-04-30",
  id: "INV-004",
  invoiceNumber: "2026-04-0001-R",
  invoiceRegistrationNumber: "T1234567890123",
  issueDate: "2026-04-02",
  items: [
    {
      amount: 50_000,
      description: "クラウドサーバー利用料（4月分）",
      quantity: 1,
      taxAmount: 5000,
      taxRate: 0.1,
      unitPrice: 50_000,
    },
  ],
  taxAmount: 5000,
  totalAmount: 55_000,
  vendor: "株式会社クラウドテック",
};

/** 全サンプル請求書 */
const sampleInvoices: Invoice[] = [
  invoiceNormal,
  invoiceHighDeviation,
  invoiceNewVendor,
  invoiceDuplicate,
];

/** 取引先の過去実績データ */
const sampleVendorHistory: VendorHistory[] = [
  { averageAmount: 55_000, invoiceCount: 12, vendor: "株式会社クラウドテック" },
  { averageAmount: 110_000, invoiceCount: 6, vendor: "ABCコンサルティング" },
];

/** 初期仕訳ルール（ナレッジストアの初期データ） */
const sampleRules: ClassificationRule[] = [
  {
    accountCode: "6340",
    accountName: "通信費",
    approvalRate: 0.95,
    descriptionPattern: "クラウドサーバー",
    lastUsed: "2026-03-01",
    usageCount: 12,
    vendor: "株式会社クラウドテック",
  },
  {
    accountCode: "6310",
    accountName: "支払手数料",
    approvalRate: 0.83,
    descriptionPattern: "コンサルティング",
    lastUsed: "2026-03-15",
    usageCount: 6,
    vendor: "ABCコンサルティング",
  },
];

export { sampleInvoices, sampleRules, sampleVendorHistory };
