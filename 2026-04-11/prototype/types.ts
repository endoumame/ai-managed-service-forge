/**
 * InvoiceForge 共通型定義
 *
 * なぜ型定義を1ファイルにまとめるか:
 * プロトタイプでは各層（ハーネス/エージェント/決定論的コード）間の
 * データ受け渡しを型で保証することが最も重要。
 * 層間の契約（Contract）を明示するために共通型ファイルを用意する。
 */

/** 請求書の生データ（入力形式） */
interface RawInvoice {
  /** 請求書ID（外部から付与） */
  id: string;
  /** 取引先名（表記ゆれあり） */
  vendorName: string;
  /** 請求日（YYYY-MM-DD） */
  invoiceDate: string;
  /** 支払期限（YYYY-MM-DD） */
  dueDate: string;
  /** 明細行 */
  lineItems: RawLineItem[];
  /** 小計（税抜） */
  subtotal: number;
  /** 消費税額 */
  taxAmount: number;
  /** 合計金額 */
  totalAmount: number;
  /** 備考（自由テキスト） */
  notes?: string;
}

/** 請求書明細行 */
interface RawLineItem {
  /** 品目名 */
  description: string;
  /** 数量 */
  quantity: number;
  /** 単価 */
  unitPrice: number;
  /** 税率（例: 0.10 = 10%） */
  taxRate: number;
  /** 行金額（税抜） */
  amount: number;
}

/** AI抽出後の構造化請求書データ */
interface ExtractedInvoice {
  invoiceId: string;
  /** 正規化された取引先ID（マスタマッチ済み or 新規） */
  vendorId: string | null;
  /** AI認識した取引先名 */
  vendorName: string;
  invoiceDate: string;
  dueDate: string;
  lineItems: ExtractedLineItem[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  /** AI抽出の信頼度 (0.0〜1.0) */
  confidence: number;
  /** AI検出の異常フラグ */
  anomalies: string[];
}

/** AI抽出後の明細行 */
interface ExtractedLineItem {
  description: string;
  /** AIが推定した品目カテゴリ */
  category: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  amount: number;
}

/** 仕訳データ */
interface JournalEntry {
  invoiceId: string;
  vendorId: string;
  vendorName: string;
  date: string;
  entries: JournalLine[];
  /** 仕訳のステータス */
  status: JournalStatus;
  /** 警告フラグ（人間確認が必要な理由） */
  warnings: string[];
}

/** 仕訳行 */
interface JournalLine {
  /** 勘定科目コード */
  accountCode: string;
  /** 勘定科目名 */
  accountName: string;
  /** 借方金額 */
  debit: number;
  /** 貸方金額 */
  credit: number;
  /** 摘要 */
  description: string;
  /** 税区分 */
  taxCategory: string;
}

/**
 * 仕訳のステータス遷移:
 * draft → validated → approved
 * draft → flagged → approved / rejected
 */
type JournalStatus = "draft" | "validated" | "flagged" | "approved" | "rejected";

/** 仕訳ルール（取引先×品目→勘定科目のマッピング） */
interface JournalRule {
  /** ルールID */
  id: string;
  /** 取引先ID（"*" = 全取引先に適用） */
  vendorId: string;
  /** 品目カテゴリ（"*" = 全品目に適用） */
  category: string;
  /** 借方勘定科目コード */
  debitAccountCode: string;
  /** 借方勘定科目名 */
  debitAccountName: string;
  /** 貸方勘定科目コード */
  creditAccountCode: string;
  /** 貸方勘定科目名 */
  creditAccountName: string;
  /** 税区分 */
  taxCategory: string;
  /** ルールの出自 */
  source: "initial" | "learned" | "manual";
  /** 適用回数 */
  usageCount: number;
}

/** ナレッジ改善提案 */
interface ImprovementProposal {
  id: string;
  type: "new_rule" | "update_rule" | "vendor_alias";
  description: string;
  /** 提案の根拠となった修正履歴 */
  evidence: CorrectionRecord[];
  /** 提案されたルール変更 */
  proposedRule?: Partial<JournalRule>;
  /** 提案されたベンダーエイリアス */
  proposedAlias?: { alias: string; canonicalVendorId: string };
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

/** ユーザーによる仕訳修正の記録 */
interface CorrectionRecord {
  invoiceId: string;
  vendorId: string;
  category: string;
  /** 修正前の勘定科目 */
  originalAccountCode: string;
  /** 修正後の勘定科目 */
  correctedAccountCode: string;
  correctedAccountName: string;
  correctedAt: string;
}

/** ハーネスの終了条件チェックリスト */
interface CompletionChecklist {
  allInvoicesExtracted: boolean;
  allAmountsValidated: boolean;
  allEntriesClassified: boolean;
  allFlaggedItemsReviewed: boolean;
  outputValidated: boolean;
}

/** ライフサイクルフックの結果 */
interface HookResult {
  passed: boolean;
  messages: string[];
  /** 警告（passedがtrueでも付与される場合あり） */
  warnings: string[];
}

export type {
  RawInvoice,
  RawLineItem,
  ExtractedInvoice,
  ExtractedLineItem,
  JournalEntry,
  JournalLine,
  JournalStatus,
  JournalRule,
  ImprovementProposal,
  CorrectionRecord,
  CompletionChecklist,
  HookResult,
};
