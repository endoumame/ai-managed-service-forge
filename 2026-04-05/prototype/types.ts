/**
 * Types.ts — 共通型定義
 *
 * 3層アーキテクチャ（ハーネス/エージェント/決定論的コード）間で
 * やり取りされるデータの型を一箇所で定義する。
 */

/** 請求書の生データ（入力） */
interface RawInvoice {
  /** プロトタイプではJSON文字列。本番ではPDFバイナリ */
  content: string;
  filename: string;
}

/** AIが抽出した請求書データ */
interface ExtractedInvoice {
  vendorName: string;
  invoiceNumber: string;
  /** YYYY-MM-DD形式 */
  invoiceDate: string;
  dueDate?: string;
  subtotalAmount: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  lineItems: InvoiceLineItem[];
  /** AI抽出の信頼度 0.0〜1.0 */
  confidence: number;
}

interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

/** 仕訳エントリ */
interface JournalEntry {
  entryDate: string;
  description: string;
  invoiceRef: string;
  lines: JournalLine[];
}

interface JournalLine {
  accountCode: string;
  accountName: string;
  debitAmount?: number;
  creditAmount?: number;
}

/** 勘定科目マスタ */
interface AccountMaster {
  code: string;
  name: string;
  category: "asset" | "liability" | "equity" | "revenue" | "expense";
}

/** ナレッジベースのマッピングルール */
interface VendorMapping {
  vendorName: string;
  accountCode: string;
  accountName: string;
  usageCount: number;
  lastUsed: string;
  source: "initial" | "human-correction" | "auto-suggested";
}

/** ナレッジ改善提案 */
interface ImprovementProposal {
  id: string;
  type: "new-mapping" | "update-mapping" | "conflict-detected";
  description: string;
  currentRule?: VendorMapping;
  proposedRule: VendorMapping;
  reason: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

export type {
  AccountMaster,
  ExtractedInvoice,
  ImprovementProposal,
  InvoiceLineItem,
  JournalEntry,
  JournalLine,
  RawInvoice,
  VendorMapping,
};
