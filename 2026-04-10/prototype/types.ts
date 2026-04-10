/**
 * InvoiceGuard 共通型定義
 *
 * なぜ型定義を独立ファイルにするか:
 * 三層（ハーネス・エージェント・決定論的コード）すべてが共有する
 * データ構造を一箇所で管理し、層間のインターフェースを明確にするため。
 */

// ===== 請求書データ =====

/** 請求書の入力データ（OCR後の構造化データを想定） */
interface Invoice {
  id: string;
  /** 取引先名 */
  vendor: string;
  /** 請求書番号 */
  invoiceNumber: string;
  /** インボイス登録番号（T + 13桁） */
  invoiceRegistrationNumber?: string;
  /** 発行日（YYYY-MM-DD） */
  issueDate: string;
  /** 支払期日（YYYY-MM-DD） */
  dueDate: string;
  items: InvoiceItem[];
  /** 税込合計額 */
  totalAmount: number;
  /** 消費税額 */
  taxAmount: number;
  /** 通貨（JPY） */
  currency: string;
}

/** 請求書の明細行 */
interface InvoiceItem {
  /** 品目・摘要 */
  description: string;
  quantity: number;
  unitPrice: number;
  /** 小計（税抜） */
  amount: number;
  /** 税率（0.10 or 0.08） */
  taxRate: number;
  /** 消費税額 */
  taxAmount: number;
}

// ===== 仕訳データ =====

/** 仕訳エントリ */
interface JournalEntry {
  id: string;
  invoiceId: string;
  /** 仕訳日（YYYY-MM-DD） */
  date: string;
  lines: JournalLine[];
  /** 摘要 */
  description: string;
  /** AIの確信度（0〜1） */
  confidence: number;
  status: JournalEntryStatus;
}

/** 仕訳行（借方 or 貸方） */
interface JournalLine {
  /** 勘定科目コード */
  accountCode: string;
  /** 勘定科目名 */
  accountName: string;
  /** 借方金額 */
  debit: number;
  /** 貸方金額 */
  credit: number;
  /** 適用税率 */
  taxRate?: number;
}

/** AIが提案 → ハーネスが要レビュー判定 → 人間が承認/修正/却下 */
type JournalEntryStatus = "proposed" | "needs_review" | "approved" | "modified" | "rejected";

// ===== 異常検知 =====

/** 異常検知結果 */
interface AnomalyResult {
  invoiceId: string;
  /** 異常スコア（0〜1、高いほど異常） */
  overallScore: number;
  checks: AnomalyCheck[];
  needsHumanReview: boolean;
}

/** 個別の異常チェック */
interface AnomalyCheck {
  type: AnomalyType;
  /** 0〜1 */
  score: number;
  message: string;
  details: Record<string, unknown>;
}

type AnomalyType =
  | "amount_deviation"
  | "duplicate_suspect"
  | "new_vendor"
  | "tax_mismatch"
  | "high_amount";

// ===== ハーネス =====

/** ライフサイクルフックの種別 */
type HookPhase =
  | "before-extract"
  | "after-extract"
  | "before-classify"
  | "after-classify"
  | "before-complete";

/** フックの実行結果 */
interface HookResult {
  phase: HookPhase;
  passed: boolean;
  errors: string[];
  warnings: string[];
}

/** 終了条件チェックリスト */
interface CompletionChecklist {
  allInvoicesProcessed: boolean;
  noUnclassifiedInvoices: boolean;
  allBalancesChecked: boolean;
  allAnomaliesReviewed: boolean;
  allInvoiceNumbersValidated: boolean;
}

// ===== ナレッジ =====

/** 仕訳ルール（ナレッジストアに蓄積） */
interface ClassificationRule {
  /** 取引先名 */
  vendor: string;
  /** 摘要のパターン */
  descriptionPattern: string;
  /** 推奨勘定科目コード */
  accountCode: string;
  /** 推奨勘定科目名 */
  accountName: string;
  /** 使用回数 */
  usageCount: number;
  /** 最終使用日 */
  lastUsed: string;
  /** 承認率（0〜1） */
  approvalRate: number;
}

/** ナレッジ改善提案 */
interface ImprovementProposal {
  id: string;
  type: "new_rule" | "update_rule" | "deprecate_rule";
  description: string;
  currentRule?: ClassificationRule;
  proposedRule?: ClassificationRule;
  /** 提案の根拠 */
  evidence: string;
  status: "pending" | "approved" | "rejected";
}

// ===== 処理パイプライン =====

/** パイプラインの処理結果 */
interface ProcessingResult {
  invoice: Invoice;
  journalEntry: JournalEntry;
  anomaly: AnomalyResult;
  hookResults: HookResult[];
  completionChecklist: CompletionChecklist;
}

// 全型定義を一括エクスポート
export type {
  AnomalyCheck,
  AnomalyResult,
  AnomalyType,
  ClassificationRule,
  CompletionChecklist,
  HookPhase,
  HookResult,
  ImprovementProposal,
  Invoice,
  InvoiceItem,
  JournalEntry,
  JournalEntryStatus,
  JournalLine,
  ProcessingResult,
};
