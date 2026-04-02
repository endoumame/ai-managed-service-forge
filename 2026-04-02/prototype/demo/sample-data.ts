/**
 * デモ用サンプルデータ
 * buildDemoInputが長くなりすぎるため、データ定義をここに分離する
 */

/* eslint-disable no-magic-numbers -- サンプルデータのリテラル値 */

import type { InvoiceData, JournalEntry } from "../harness/types.js";

const SAMPLE_INVOICE: InvoiceData = {
  dueDate: "2026-04-30",
  invoiceNumber: "INV-2026-0042",
  issueDate: "2026-03-28",
  lineItems: [
    {
      amount: 50_000,
      description: "Webサーバー保守（4月分）",
      quantity: 1,
      taxRate: 0.1,
      unitPrice: 50_000,
    },
    { amount: 15_000, description: "SSL証明書更新", quantity: 1, taxRate: 0.1, unitPrice: 15_000 },
    {
      amount: 6000,
      description: "ドメイン更新（1年分）",
      quantity: 2,
      taxRate: 0.1,
      unitPrice: 3000,
    },
  ],
  registrationNumber: "T1234567890123",
  subtotal: 71_000,
  taxAmount: 7100,
  totalAmount: 78_100,
  vendor: "株式会社テクノソリューションズ",
};

const SAMPLE_ENTRIES: JournalEntry[] = [
  {
    amount: 50_000,
    creditAccountCode: "2100",
    creditAccountName: "買掛金",
    debitAccountCode: "5400",
    debitAccountName: "通信費",
    description: "株式会社テクノソリューションズ - Webサーバー保守（4月分）",
    taxCategory: "課税仕入10%",
  },
  {
    amount: 15_000,
    creditAccountCode: "2100",
    creditAccountName: "買掛金",
    debitAccountCode: "5400",
    debitAccountName: "通信費",
    description: "株式会社テクノソリューションズ - SSL証明書更新",
    taxCategory: "課税仕入10%",
  },
  {
    amount: 6000,
    creditAccountCode: "2100",
    creditAccountName: "買掛金",
    debitAccountCode: "5400",
    debitAccountName: "通信費",
    description: "株式会社テクノソリューションズ - ドメイン更新（1年分）",
    taxCategory: "課税仕入10%",
  },
];

export { SAMPLE_ENTRIES, SAMPLE_INVOICE };
