import type { Invoice } from "../types.ts";

const sampleInvoiceKnownVendor: Invoice = {
  id: "INV-2026-001",
  invoiceDate: "2026-04-15",
  lineItems: [
    {
      description: "A3カラーチラシ印刷 5000部",
      quantity: 5000,
      taxRate: 0.1,
      unitPrice: 12,
    },
    {
      description: "デザイン制作費",
      quantity: 1,
      taxRate: 0.1,
      unitPrice: 50_000,
    },
  ],
  notes: "月末締め翌月末払い",
  taxAmount: 11_000,
  totalAmount: 121_000,
  vendorName: "株式会社サクラ印刷",
};

const sampleInvoiceNewVendor: Invoice = {
  id: "INV-2026-002",
  invoiceDate: "2026-04-20",
  lineItems: [
    {
      description: "クラウドサーバー利用料 4月分",
      quantity: 1,
      taxRate: 0.1,
      unitPrice: 180_000,
    },
  ],
  notes: "初回取引",
  taxAmount: 18_000,
  totalAmount: 198_000,
  vendorName: "クラウドテック株式会社",
};

const sampleInvoiceHighAmount: Invoice = {
  id: "INV-2026-003",
  invoiceDate: "2026-04-25",
  lineItems: [
    {
      description: "オフィス賃料 5月分",
      quantity: 1,
      taxRate: 0.1,
      unitPrice: 1_200_000,
    },
  ],
  taxAmount: 120_000,
  totalAmount: 1_320_000,
  vendorName: "東京不動産管理株式会社",
};

export { sampleInvoiceHighAmount, sampleInvoiceKnownVendor, sampleInvoiceNewVendor };
