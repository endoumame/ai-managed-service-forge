/**
 * InvoicePilot 共通型定義
 *
 * 三層構造（ハーネス / AIエージェント / 決定論的コード）間で共有される
 * データ型を一元管理する。型定義を共有することで、層間のインターフェースが
 * コンパイル時に保証される。
 */

/** 請求書の入力データ（OCR後を想定したテキスト/構造化データ） */
interface RawInvoiceInput {
  /** 請求書の生テキスト、またはすでに構造化されたJSON */
  text?: string;
  structured?: Partial<ExtractedInvoice>;
  /** 入力元の識別子（ファイル名等） */
  sourceId: string;
}

/** AIエージェントが抽出した請求書データ */
interface ExtractedInvoice {
  vendorName: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;
  lineItems: LineItem[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  /** AI抽出の信頼度 (0-1) */
  confidence: number;
}

/** 明細行 */
interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  /** 税率区分: "standard" (10%) or "reduced" (8%) */
  taxCategory: "standard" | "reduced";
}

/** 勘定科目の推定結果 */
interface AccountClassification {
  accountCode: string;
  accountName: string;
  confidence: number;
  /** 推定の根拠 */
  reasoning: string;
}

/** 仕訳データ */
interface JournalEntry {
  date: string;
  debitAccount: string;
  debitAmount: number;
  creditAccount: string;
  creditAmount: number;
  description: string;
  vendorName: string;
  invoiceNumber: string;
}

/** ハーネスのチェックリスト項目 */
interface ChecklistItem {
  id: string;
  label: string;
  passed: boolean;
  detail?: string;
}

/** ハーネスの終了条件チェックリスト */
interface CompletionChecklist {
  items: ChecklistItem[];
  allPassed: boolean;
  /** 未通過項目のサマリー */
  failureSummary?: string;
}

/** ナレッジストアのエントリ */
interface KnowledgeEntry {
  /** 取引先名 → 正式名称のマッピング */
  vendorAliases: Record<string, string>;
  /** 取引先 × 明細内容 → 勘定科目のマッピング */
  accountMappings: AccountMapping[];
  /** 処理済み請求書番号（重複検知用） */
  processedInvoices: ProcessedInvoiceRecord[];
}

interface AccountMapping {
  vendorName: string;
  descriptionPattern: string;
  accountCode: string;
  accountName: string;
  /** この学習データが何回参照されたか */
  usageCount: number;
  lastUsed: string;
}

interface ProcessedInvoiceRecord {
  invoiceNumber: string;
  vendorName: string;
  totalAmount: number;
  processedAt: string;
}

/** ヒューマン・イン・ザ・ループの要求 */
interface HumanReviewRequest {
  type: "account_confirmation" | "new_vendor" | "amount_anomaly";
  message: string;
  options?: string[];
  currentValue?: string;
  /** 自動解決のデフォルト値（テスト時に使用） */
  defaultValue?: string;
}

/** パイプライン全体の処理結果 */
interface ProcessingResult {
  sourceId: string;
  extracted: ExtractedInvoice;
  classification: AccountClassification;
  journalEntry: JournalEntry;
  checklist: CompletionChecklist;
  knowledgeUpdates: string[];
  humanReviewsRequested: HumanReviewRequest[];
}

/** ライフサイクルフックの定義 */
type HookPhase = "beforeExtract" | "afterExtract" | "afterClassify" | "afterJournalEntry";

interface HookResult {
  phase: HookPhase;
  passed: boolean;
  errors: string[];
  warnings: string[];
}

export type {
  AccountClassification,
  AccountMapping,
  ChecklistItem,
  CompletionChecklist,
  ExtractedInvoice,
  HookPhase,
  HookResult,
  HumanReviewRequest,
  JournalEntry,
  KnowledgeEntry,
  LineItem,
  ProcessedInvoiceRecord,
  ProcessingResult,
  RawInvoiceInput,
};
