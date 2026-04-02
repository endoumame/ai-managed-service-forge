/**
 * InvoicePilot の型定義
 *
 * なぜここに集約するか:
 * ハーネス・エージェント・決定論的コード層の全てが共通の型を使うことで、
 * 層間のデータ受け渡しに型安全性を保証する。
 */

/** 請求書から抽出された構造化データ */
interface InvoiceData {
  /** 請求書番号 */
  invoiceNumber: string | null;
  /** 発行元（取引先名） */
  vendor: string | null;
  /** 発行日 (YYYY-MM-DD) */
  issueDate: string | null;
  /** 支払期限 (YYYY-MM-DD) */
  dueDate: string | null;
  /** 品目リスト */
  lineItems: LineItem[];
  /** 小計（税抜） */
  subtotal: number | null;
  /** 消費税額 */
  taxAmount: number | null;
  /** 合計金額（税込） */
  totalAmount: number | null;
  /** 適格請求書発行事業者番号 (T + 13桁) */
  registrationNumber: string | null;
}

interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  /** 税率 (0.08 or 0.10) */
  taxRate: number;
}

/** 仕訳データ */
interface JournalEntry {
  /** 借方勘定科目コード */
  debitAccountCode: string;
  /** 借方勘定科目名 */
  debitAccountName: string;
  /** 貸方勘定科目コード */
  creditAccountCode: string;
  /** 貸方勘定科目名 */
  creditAccountName: string;
  /** 金額 */
  amount: number;
  /** 税区分 */
  taxCategory: string;
  /** 摘要 */
  description: string;
}

/** パイプラインの各ステップの完了状態 */
interface CompletionChecklist {
  /** 全必須フィールドが抽出済みか */
  allRequiredFieldsExtracted: boolean;
  /** 仕訳コードがマスタに存在するか */
  accountCodesValid: boolean;
  /** 税額計算が一致するか（許容誤差±1円） */
  taxCalculationMatches: boolean;
  /** 重複請求書チェック完了か */
  duplicateCheckDone: boolean;
  /** 異常値チェック完了か */
  anomalyCheckDone: boolean;
}

/** バリデーション結果 */
interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/** ナレッジストアのエントリ */
interface KnowledgeEntry {
  vendor: string;
  itemPattern: string;
  accountCode: string;
  accountName: string;
  confidence: number;
  usageCount: number;
  lastUsed: string;
}

/** 改善提案 */
interface ImprovementSuggestion {
  type: "new_mapping" | "update_mapping";
  vendor: string;
  itemPattern: string;
  suggestedAccountCode: string;
  suggestedAccountName: string;
  reason: string;
}

/** パイプライン処理結果 */
interface PipelineResult {
  invoice: InvoiceData;
  journalEntries: JournalEntry[];
  checklist: CompletionChecklist;
  validation: ValidationResult;
  suggestions: ImprovementSuggestion[];
  requiresHumanReview: boolean;
  reviewReasons: string[];
}

export type {
  CompletionChecklist,
  ImprovementSuggestion,
  InvoiceData,
  JournalEntry,
  KnowledgeEntry,
  LineItem,
  PipelineResult,
  ValidationResult,
};
