// InvoiceForge プロトタイプの型定義
// ハーネス・エージェント・決定論的コード層の境界を型で明確にする

/** 請求書の生データ（入力） */
interface RawInvoice {
  id: string;
  vendor: string;
  invoiceNumber: string;
  date: string;
  items: RawInvoiceItem[];
  totalAmount: number;
  taxAmount: number;
  notes?: string;
}

interface RawInvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
}

/** AI抽出結果（エージェント層の出力） */
interface ExtractedData {
  vendor: string;
  invoiceNumber: string;
  date: string;
  items: ExtractedItem[];
  totalAmount: number;
  taxAmount: number;
  // 0.0〜1.0 ハーネスがこの値で品質ゲートを制御
  confidence: number;
}

interface ExtractedItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  taxRate: number;
  // AI推定の勘定科目
  suggestedAccount: string;
  accountConfidence: number;
}

/** 仕訳エントリ（決定論的コード層の出力） */
interface JournalEntry {
  invoiceId: string;
  date: string;
  entries: JournalLine[];
  status: "draft" | "pending_review" | "approved" | "rejected";
  reviewReason?: string;
}

interface JournalLine {
  // 勘定科目
  account: string;
  // 借方
  debit: number;
  // 貸方
  credit: number;
  description: string;
}

/** パイプラインのステージ定義 */
type PipelineStage =
  | "received"
  | "extracting"
  | "extracted"
  | "journalizing"
  | "journalized"
  | "reviewing"
  | "approved"
  | "rejected";

/** ハーネスのチェックリスト項目 */
interface ChecklistItem {
  id: string;
  description: string;
  stage: PipelineStage;
  check: (context: PipelineContext) => CheckResult;
}

interface CheckResult {
  passed: boolean;
  message: string;
  severity: "error" | "warning" | "info";
}

/** パイプライン全体のコンテキスト（各ステージの成果物を保持） */
interface PipelineContext {
  invoiceId: string;
  stage: PipelineStage;
  rawInvoice: RawInvoice;
  extractedData?: ExtractedData;
  journalEntry?: JournalEntry;
  checkResults: CheckResult[];
  humanReviewRequired: boolean;
  humanReviewReasons: string[];
}

/** ナレッジストアのエントリ */
interface KnowledgeEntry {
  vendor: string;
  description: string;
  account: string;
  // この組み合わせが使われた回数
  frequency: number;
  lastUsed: string;
}

/** ナレッジ改善提案 */
interface ImprovementProposal {
  id: string;
  type: "new_mapping" | "update_mapping" | "conflict_detected";
  description: string;
  currentRule?: KnowledgeEntry;
  proposedRule: KnowledgeEntry;
  // 提案の根拠となった修正履歴
  evidence: string[];
  status: "pending" | "approved" | "rejected";
}

/** ライフサイクルフックの型 */
interface LifecycleHook {
  name: string;
  stage: "before" | "after";
  target: PipelineStage;
  execute: (context: PipelineContext) => Promise<HookResult> | HookResult;
}

interface HookResult {
  // Falseならパイプラインを停止
  proceed: boolean;
  messages: string[];
  modifiedContext?: Partial<PipelineContext>;
}

export type {
  ChecklistItem,
  CheckResult,
  ExtractedData,
  ExtractedItem,
  HookResult,
  ImprovementProposal,
  JournalEntry,
  JournalLine,
  KnowledgeEntry,
  LifecycleHook,
  PipelineContext,
  PipelineStage,
  RawInvoice,
  RawInvoiceItem,
};
