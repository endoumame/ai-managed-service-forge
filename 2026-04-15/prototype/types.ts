/**
 * InvoiceForge の型定義
 *
 * 三層アーキテクチャ（ハーネス / AIエージェント / 決定論的コード）全体で共有する型。
 * 型によってレイヤー間のインターフェースを厳密に定義し、
 * 各レイヤーの責務を型レベルで保証する。
 */

// ─── 請求書データ ───

interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
}

interface Invoice {
  id: string;
  vendor: string;
  date: string;
  dueDate: string;
  items: InvoiceItem[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  // 適格請求書発行事業者の登録番号
  invoiceNumber: string;
}

// ─── 勘定科目マスタ ───

interface AccountCode {
  code: string;
  name: string;
  description: string;
}

// ─── AI分類結果 ───

interface ClassificationResult {
  invoiceId: string;
  accountCode: string;
  accountName: string;
  // 0.0〜1.0 の信頼度スコア
  confidence: number;
  // AIが分類理由を説明するテキスト
  reasoning: string;
}

// ─── バリデーション結果 ───

type ValidationSeverity = "error" | "warning" | "info";

interface ValidationIssue {
  field: string;
  message: string;
  severity: ValidationSeverity;
}

interface ValidationResult {
  invoiceId: string;
  valid: boolean;
  issues: ValidationIssue[];
}

// ─── 処理ステータス（ハーネスが管理） ───

/**
 * Pending: 未処理
 * classified: AI分類完了
 * validated: バリデーション通過
 * pending_approval: 人間の承認待ち
 * approved: 承認済み
 * rejected: 却下（再分類必要）
 * corrected: 人間が修正して確定
 */
type ProcessingStatus =
  | "pending"
  | "classified"
  | "validated"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "corrected";

interface ProcessingRecord {
  invoice: Invoice;
  classification: ClassificationResult | null;
  validation: ValidationResult | null;
  status: ProcessingStatus;
  // 人間が修正した場合の勘定科目
  correctedAccountCode: string | null;
  correctedAccountName: string | null;
  processedAt: string | null;
  approvedAt: string | null;
}

// ─── ナレッジストア ───

interface VendorPattern {
  vendor: string;
  itemKeyword: string;
  accountCode: string;
  accountName: string;
  // このパターンが使用された回数
  frequency: number;
  // 最後に使用された日時
  lastUsed: string;
  // 初期データか学習データか
  source: "initial" | "learned";
}

interface ImprovementProposal {
  id: string;
  vendor: string;
  itemKeyword: string;
  currentAccountCode: string;
  proposedAccountCode: string;
  proposedAccountName: string;
  // 同一修正が何回蓄積されたか
  correctionCount: number;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

// ─── ハーネスのチェックリスト ───

interface ChecklistItem {
  id: string;
  description: string;
  passed: boolean;
  checkedAt: string | null;
}

// ─── ライフサイクルフック ───

type HookPhase = "before-classify" | "after-classify" | "on-approval" | "on-complete";

interface HookContext {
  phase: HookPhase;
  record: ProcessingRecord;
  knowledgePatterns: VendorPattern[];
}

interface HookResult {
  proceed: boolean;
  modifiedRecord?: ProcessingRecord;
  issues?: ValidationIssue[];
  // AIへの追加コンテキスト
  injectedContext?: string;
}

// ─── バリデーションコンテキスト（パラメータ集約） ───

interface ValidationContext {
  invoice: Invoice;
  classification: ClassificationResult;
  processedInvoiceNumbers: Set<string>;
  pastPatterns: VendorPattern[];
  accountMaster: AccountCode[];
}

export type {
  AccountCode,
  ChecklistItem,
  ClassificationResult,
  HookContext,
  HookPhase,
  HookResult,
  ImprovementProposal,
  Invoice,
  InvoiceItem,
  ProcessingRecord,
  ProcessingStatus,
  ValidationContext,
  ValidationIssue,
  ValidationResult,
  ValidationSeverity,
  VendorPattern,
};
