// InvoiceForge 共通型定義

/** 請求書の入力データ（OCR後を想定、プロトタイプではJSON直接入力） */
interface InvoiceInput {
  invoiceId: string;
  vendor: string;
  /** YYYY-MM-DD */
  invoiceDate: string;
  /** YYYY-MM-DD */
  dueDate: string;
  items: InvoiceLineItem[];
  totalAmount: number;
  taxAmount: number;
  notes?: string;
}

interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  /** 0.10（標準税率）or 0.08（軽減税率） */
  taxRate: number;
}

/** AI抽出結果 */
interface ExtractedData {
  vendor: string;
  invoiceDate: string;
  dueDate: string;
  items: ExtractedLineItem[];
  totalAmount: number;
  taxAmount: number;
  /** 全体の信頼度 0.0〜1.0 */
  confidence: number;
}

interface ExtractedLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  taxRate: number;
  /** 推定された勘定科目 */
  suggestedAccount: string;
  /** 科目推定の信頼度 */
  accountConfidence: number;
}

/** 仕訳エントリ */
interface JournalEntry {
  date: string;
  entries: JournalLine[];
  vendor: string;
  invoiceId: string;
  description: string;
}

interface JournalLine {
  /** 勘定科目 */
  account: string;
  /** 補助科目 */
  subAccount?: string;
  /** 借方金額 */
  debit: number;
  /** 貸方金額 */
  credit: number;
}

/** ハーネスのチェックリスト項目 */
interface ChecklistItem {
  id: string;
  label: string;
  passed: boolean;
  detail?: string;
}

/** パイプラインのステップ結果 */
interface StepResult<TData> {
  success: boolean;
  data?: TData;
  errors: string[];
  warnings: string[];
  checklist: ChecklistItem[];
}

/** 承認ワークフローの状態 */
type ApprovalStatus = "pending" | "approved" | "rejected" | "escalated";

/** 処理結果全体 */
interface ProcessingResult {
  invoiceId: string;
  status: ApprovalStatus;
  extractedData?: ExtractedData;
  journalEntry?: JournalEntry;
  checklist: ChecklistItem[];
  escalationReasons: string[];
  knowledgeUpdates: KnowledgeUpdate[];
}

/** ナレッジ更新提案 */
interface KnowledgeUpdate {
  type: "new_rule" | "update_rule" | "flag_conflict";
  vendor: string;
  description: string;
  proposedMapping: {
    pattern: string;
    account: string;
  };
  reason: string;
}

/** ナレッジベースのルール */
interface KnowledgeRule {
  id: string;
  vendor: string;
  /** 明細内容のマッチパターン */
  pattern: string;
  /** 勘定科目 */
  account: string;
  confidence: number;
  usageCount: number;
  lastUsed: string;
  source: "manual" | "learned";
}

/** 勘定科目マスタ */
interface AccountMaster {
  code: string;
  name: string;
  category: "expense" | "asset" | "liability" | "revenue";
  keywords: string[];
}

export type {
  AccountMaster,
  ApprovalStatus,
  ChecklistItem,
  ExtractedData,
  ExtractedLineItem,
  InvoiceInput,
  InvoiceLineItem,
  JournalEntry,
  JournalLine,
  KnowledgeRule,
  KnowledgeUpdate,
  ProcessingResult,
  StepResult,
};
