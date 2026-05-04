import type { InvoiceInput } from "../types.ts";

const sampleInvoices: InvoiceInput[] = [
  {
    currency: "JPY",
    dueDate: "2026-05-31",
    invoiceId: "INV-2026-001",
    invoiceNumber: "T1234567890123",
    issueDate: "2026-05-01",
    items: [
      {
        amount: 150_000,
        description: "AWSサーバ利用料（4月分）",
        quantity: 1,
        taxRate: 0.1,
        unitPrice: 150_000,
      },
      {
        amount: 30_000,
        description: "データバックアップサービス",
        quantity: 1,
        taxRate: 0.1,
        unitPrice: 30_000,
      },
    ],
    taxAmount: 18_000,
    totalAmount: 198_000,
    vendorName: "株式会社クラウドテック",
  },
  {
    currency: "JPY",
    dueDate: "2026-06-30",
    invoiceId: "INV-2026-002",
    invoiceNumber: "T9876543210987",
    issueDate: "2026-05-01",
    items: [
      {
        amount: 500_000,
        description: "経営コンサルティング報酬（4月分）",
        quantity: 1,
        taxRate: 0.1,
        unitPrice: 500_000,
      },
    ],
    taxAmount: 50_000,
    totalAmount: 550_000,
    vendorName: "㈱ビジネスコンサルティング",
  },
  {
    currency: "JPY",
    dueDate: "2026-05-31",
    invoiceId: "INV-2026-003",
    invoiceNumber: "INV-003-2026",
    issueDate: "2026-05-02",
    items: [
      {
        amount: 20_000,
        description: "文房具セット",
        quantity: 10,
        taxRate: 0.1,
        unitPrice: 2000,
      },
      {
        amount: 25_000,
        description: "コピー用紙 A4",
        quantity: 50,
        taxRate: 0.1,
        unitPrice: 500,
      },
    ],
    taxAmount: 4500,
    totalAmount: 49_500,
    vendorName: "有限会社オフィスサプライ",
  },
];

export { sampleInvoices };
