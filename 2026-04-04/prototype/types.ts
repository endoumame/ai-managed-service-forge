/**
 * InvoiceForge 共通型定義
 *
 * なぜ型を最初に定義するか:
 * ハーネス層・AIエージェント層・決定論的コード層の3層間のデータ受け渡しを
 * 型レベルで保証し、層間のインターフェースを明確にするため。
 */

/** 請求書から抽出された生データ */
interface ExtractedInvoiceData {
  /** 請求日 (YYYY-MM-DD) */
  invoiceDate: string;
  /** 支払期限 (YYYY-MM-DD) */
  dueDate: string | null;
  /** 取引先名（請求書に記載された通り） */
  vendorName: string;
  /** 請求番号 */
  invoiceNumber: string;
  /** 明細行 */
  lineItems: LineItem[];
  /** 小計（税抜） */
  subtotal: number;
  /** 消費税額 */
  taxAmount: number;
  /** 合計額（税込） */
  totalAmount: number;
  /** AI抽出時の信頼度スコア (0.0〜1.0) */
  confidenceScore: number;
}

interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  /** 軽減税率対象かどうか */
  isReducedTaxRate: boolean;
}

/** 勘定科目分類結果 */
interface AccountClassification {
  /** 借方勘定科目コード */
  debitAccountCode: string;
  /** 借方勘定科目名 */
  debitAccountName: string;
  /** 貸方勘定科目コード */
  creditAccountCode: string;
  /** 貸方勘定科目名 */
  creditAccountName: string;
  /** 分類の信頼度 (0.0〜1.0) */
  confidence: number;
  /** 分類の根拠 */
  reasoning: string;
}

/** 仕訳データ（最終出力形式） */
interface JournalEntry {
  /** 仕訳日付 */
  date: string;
  /** 借方勘定科目 */
  debitAccount: string;
  /** 借方金額 */
  debitAmount: number;
  /** 貸方勘定科目 */
  creditAccount: string;
  /** 貸方金額 */
  creditAmount: number;
  /** 摘要 */
  description: string;
  /** 税区分 */
  taxCategory: string;
  /** 消費税額 */
  taxAmount: number;
}

/** 終了条件チェックリスト項目 */
interface ChecklistItem {
  id: string;
  label: string;
  passed: boolean;
  message: string;
}

/** ハーネスのフック結果 */
interface HookResult {
  passed: boolean;
  warnings: string[];
  errors: string[];
}

/** ナレッジストアに蓄積するマッピングルール */
interface AccountMappingRule {
  vendorName: string;
  descriptionPattern: string;
  accountCode: string;
  accountName: string;
  occurrences: number;
  lastUsed: string;
  approved: boolean;
}

/** ナレッジ改善提案 */
interface ImprovementProposal {
  id: string;
  type: "new_rule" | "update_rule" | "conflict_detected";
  description: string;
  currentRule: AccountMappingRule | null;
  proposedRule: AccountMappingRule;
  evidence: string[];
  createdAt: string;
}

/** 処理パイプライン全体の状態 */
interface PipelineState {
  invoiceText: string;
  extracted: ExtractedInvoiceData | null;
  classification: AccountClassification | null;
  journalEntries: JournalEntry[];
  checklist: ChecklistItem[];
  hookResults: HookResult[];
  needsHumanReview: boolean;
  humanReviewReasons: string[];
}

export {
  type ExtractedInvoiceData,
  type LineItem,
  type AccountClassification,
  type JournalEntry,
  type ChecklistItem,
  type HookResult,
  type AccountMappingRule,
  type ImprovementProposal,
  type PipelineState,
};
