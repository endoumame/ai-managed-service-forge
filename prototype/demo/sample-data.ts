/*
 * デモ用サンプルデータ
 * 本番ではDB/APIから取得するが、プロトタイプではインラインで定義
 */

import type { KnowledgeEntry, RawInvoice } from "../types.ts";

/** サンプル請求書データ（3パターン: 通常/複数明細/高額） */
const SAMPLE_INVOICES: RawInvoice[] = [
  {
    date: "2026-04-01",
    id: "INV-001",
    invoiceNumber: "CT-2026-0401",
    items: [
      { description: "AWS利用料（3月分）", quantity: 1, taxRate: 0.1, unitPrice: 85_000 },
      { description: "サーバー監視サービス", quantity: 1, taxRate: 0.1, unitPrice: 15_000 },
    ],
    notes: "月額クラウドインフラ費用",
    taxAmount: 10_000,
    totalAmount: 110_000,
    vendor: "株式会社クラウドテック",
  },
  {
    date: "2026-03-15",
    id: "INV-002",
    invoiceNumber: "OS-20260315",
    items: [
      { description: "コピー用紙 A4 5000枚", quantity: 10, taxRate: 0.1, unitPrice: 3500 },
      { description: "トナーカートリッジ", quantity: 2, taxRate: 0.1, unitPrice: 12_000 },
    ],
    notes: "",
    taxAmount: 5900,
    totalAmount: 59_000,
    vendor: "オフィスサプライ合同会社",
  },
  {
    date: "2026-03-31",
    id: "INV-003",
    invoiceNumber: "GM-2026-Q1",
    items: [
      { description: "Web広告運用代行（1-3月）", quantity: 1, taxRate: 0.1, unitPrice: 1_500_000 },
    ],
    notes: "高額案件 - 部長承認必要",
    taxAmount: 150_000,
    totalAmount: 1_650_000,
    vendor: "グローバルマーケティング株式会社",
  },
];

/** 初期ナレッジ（過去の学習データ） */
const INITIAL_KNOWLEDGE: KnowledgeEntry[] = [
  {
    account: "通信費",
    description: "AWS利用料",
    frequency: 12,
    lastUsed: "2026-03-01T00:00:00.000Z",
    vendor: "株式会社クラウドテック",
  },
];

/** 修正履歴のシミュレーション（ナレッジ改善デモ用） */
const SAMPLE_CORRECTIONS = [
  {
    description: "サーバー監視サービス",
    fromAccount: "通信費",
    toAccount: "外注費",
    vendor: "株式会社クラウドテック",
  },
  {
    description: "サーバー監視サービス",
    fromAccount: "通信費",
    toAccount: "外注費",
    vendor: "株式会社クラウドテック",
  },
  {
    description: "サーバー監視サービス",
    fromAccount: "通信費",
    toAccount: "外注費",
    vendor: "株式会社クラウドテック",
  },
];

export { INITIAL_KNOWLEDGE, SAMPLE_CORRECTIONS, SAMPLE_INVOICES };
