/**
 * Demo/data.ts — デモ用のサンプルデータ定義
 */

import type { ExtractedInvoice, VendorMapping } from "../types.ts";

const SAMPLE_INVOICES: ExtractedInvoice[] = [
  {
    confidence: 0.95,
    invoiceDate: "2026-04-01",
    invoiceNumber: "INV-2026-0401",
    lineItems: [
      { amount: 50_000, description: "コピー用紙 A4 500枚×10", quantity: 10, unitPrice: 5000 },
      { amount: 50_000, description: "文具セット", quantity: 20, unitPrice: 2500 },
    ],
    subtotalAmount: 100_000,
    taxAmount: 10_000,
    taxRate: 0.1,
    totalAmount: 110_000,
    vendorName: "株式会社ABC商事",
  },
  {
    confidence: 0.92,
    invoiceDate: "2026-04-01",
    invoiceNumber: "TS-20260401-001",
    lineItems: [
      { amount: 300_000, description: "サーバ運用保守 4月分", quantity: 1, unitPrice: 300_000 },
      {
        amount: 200_000,
        description: "クラウドインフラ利用料 4月分",
        quantity: 1,
        unitPrice: 200_000,
      },
    ],
    subtotalAmount: 500_000,
    taxAmount: 50_000,
    taxRate: 0.1,
    totalAmount: 550_000,
    vendorName: "テックサービス株式会社",
  },
  {
    confidence: 0.88,
    invoiceDate: "2026-04-05",
    invoiceNumber: "DL-2026-042",
    lineItems: [
      { amount: 250_000, description: "広告バナーデザイン制作", quantity: 5, unitPrice: 50_000 },
    ],
    subtotalAmount: 250_000,
    taxAmount: 25_000,
    taxRate: 0.1,
    totalAmount: 275_000,
    vendorName: "株式会社デザインラボ",
  },
];

const INITIAL_MAPPINGS: VendorMapping[] = [
  {
    accountCode: "5300",
    accountName: "消耗品費",
    lastUsed: "2026-03-01",
    source: "initial",
    usageCount: 15,
    vendorName: "株式会社ABC商事",
  },
  {
    accountCode: "5400",
    accountName: "通信費",
    lastUsed: "2026-03-15",
    source: "initial",
    usageCount: 8,
    vendorName: "テックサービス株式会社",
  },
];

export { INITIAL_MAPPINGS, SAMPLE_INVOICES };
