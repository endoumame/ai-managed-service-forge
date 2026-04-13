/**
 * InvoiceForge 共通型定義
 *
 * なぜ型を分離するか:
 * ハーネス層・AIエージェント層・決定論的コード層の間で受け渡すデータの
 * 「契約」を型で定義することで、各層の境界が明確になる。
 * AIの出力が型に合わなければコンパイル時に検出できる。
 */

// ── 請求書入力 ──

/** 請求書の生テキスト入力 */
interface InvoiceInput {
  /** 請求書のテキスト内容（OCR結果またはテキスト入力） */
  rawText: string;
  /** 入力元（手入力、OCR、メール等） */
  source: "manual" | "ocr" | "email";
}

// ── 構造化された請求書データ ──

/** AIが解析した請求書の構造化データ */
interface ParsedInvoice {
  vendor: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  lineItems: LineItem[];
  subtotal: number;
  taxAmount: number;
  taxRate: number;
  totalAmount: number;
  /** AI解析の確信度 (0.0〜1.0) */
  confidence: number;
}

interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

// ── 仕訳データ ──

/** 仕訳エントリ */
interface JournalEntry {
  date: string;
  entries: JournalLine[];
  description: string;
  vendor: string;
  invoiceNumber: string;
}

interface JournalLine {
  /** 勘定科目コード */
  accountCode: string;
  /** 勘定科目名 */
  accountName: string;
  /** 借方金額（0なら貸方） */
  debit: number;
  /** 貸方金額（0なら借方） */
  credit: number;
  /** 税区分 */
  taxCategory: "taxable_10" | "taxable_8" | "exempt" | "non_taxable";
}

// ── ハーネス関連 ──

/** ライフサイクルフックの結果 */
interface HookResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

/** 終了条件チェックリストの項目 */
interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
  /** 検証関数が設定した詳細メッセージ */
  detail?: string;
}

/** バリデーション結果 */
interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

interface ValidationError {
  field: string;
  message: string;
  severity: "error" | "warning";
}

// ── ナレッジ関連 ──

/** 取引先の仕訳パターン */
interface VendorPattern {
  vendor: string;
  /** 過去に使われた勘定科目の頻度マップ */
  accountFrequency: Record<string, number>;
  /** 最後に使われた仕訳パターン */
  lastUsedAccounts: string[];
  /** パターンの確定度（処理回数に基づく） */
  processedCount: number;
}

/** ナレッジ改善提案 */
interface ImprovementProposal {
  id: string;
  type: "new_rule" | "update_rule" | "conflict_detected";
  vendor: string;
  description: string;
  suggestedAccountCode: string;
  suggestedAccountName: string;
  evidence: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

// ── 処理パイプライン全体 ──

/** パイプライン全体の状態 */
interface PipelineState {
  input: InvoiceInput;
  parsed?: ParsedInvoice;
  journal?: JournalEntry;
  checklist: ChecklistItem[];
  validationErrors: ValidationError[];
  /** 人間の承認状態 */
  approval: "pending" | "approved" | "rejected" | "modified";
  /** 人間による修正内容 */
  modifications?: JournalEntry;
}

export type {
  ChecklistItem,
  HookResult,
  ImprovementProposal,
  InvoiceInput,
  JournalEntry,
  JournalLine,
  LineItem,
  ParsedInvoice,
  PipelineState,
  ValidationError,
  ValidationResult,
  VendorPattern,
};
