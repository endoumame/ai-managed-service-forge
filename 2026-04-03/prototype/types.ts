/**
 * ReconcileBot 共通型定義
 *
 * なぜ型定義を分離するか:
 * 3層（ハーネス/エージェント/決定論的コード）の境界を型で明確にすることで、
 * 各層の責務が曖昧になる（ドリフトする）ことを防ぐ。
 */

/** 銀行入金データ（入力） */
interface BankDeposit {
  /** 入金ID（銀行明細の一意識別子） */
  id: string;
  /** 入金日 */
  date: string;
  /** 振込名義（カナ） */
  payerName: string;
  /** 入金金額 */
  amount: number;
  /** 摘要 */
  description: string;
}

/** 売掛金データ（入力） */
interface Receivable {
  /** 売掛金ID */
  id: string;
  /** 請求書番号 */
  invoiceNumber: string;
  /** 取引先名 */
  clientName: string;
  /** 取引先コード */
  clientCode: string;
  /** 請求金額（税込） */
  amountWithTax: number;
  /** 請求金額（税抜） */
  amountWithoutTax: number;
  /** 請求日 */
  invoiceDate: string;
  /** 支払期日 */
  dueDate: string;
}

/** マッチング結果の分類 */
type MatchCategory = "auto_confirmed" | "candidate" | "investigation_required";

/** マッチング結果 */
interface MatchResult {
  /** 入金データ */
  deposit: BankDeposit;
  /** マッチした売掛金（候補含む） */
  receivable: Receivable | null;
  /** 分類 */
  category: MatchCategory;
  /** マッチング手法 */
  matchMethod: "exact_amount" | "amount_with_fee" | "ai_fuzzy" | "none";
  /** AI信頼度スコア（0〜1、AIマッチング時のみ） */
  confidence: number | null;
  /** マッチング理由の説明 */
  reason: string;
}

/** ハーネスの終了条件チェックリスト */
interface CompletionChecklist {
  allDepositsProcessed: boolean;
  amountIntegrityPassed: boolean;
  noDuplicateMatches: boolean;
  allCandidatesScored: boolean;
}

/** ナレッジ辞書エントリ */
interface KnowledgeEntry {
  /** 振込名義パターン */
  payerNamePattern: string;
  /** マッチする取引先コード */
  clientCode: string;
  /** 取引先名 */
  clientName: string;
  /** このパターンが使われた回数 */
  usageCount: number;
  /** 確定ルールに昇格済みか */
  isPromoted: boolean;
  /** 最終使用日 */
  lastUsedDate: string;
}

/** ナレッジ改善提案 */
interface ImprovementProposal {
  entry: KnowledgeEntry;
  proposalType: "promote_to_rule";
  reason: string;
}

/** ハーネスのライフサイクルフック結果 */
interface HookResult {
  passed: boolean;
  issues: string[];
}

/** パイプライン全体の実行結果 */
interface PipelineResult {
  results: MatchResult[];
  checklist: CompletionChecklist;
  proposals: ImprovementProposal[];
  summary: {
    totalDeposits: number;
    autoConfirmed: number;
    candidates: number;
    investigationRequired: number;
    totalAmountProcessed: number;
  };
}

export type {
  BankDeposit,
  CompletionChecklist,
  HookResult,
  ImprovementProposal,
  KnowledgeEntry,
  MatchCategory,
  MatchResult,
  PipelineResult,
  Receivable,
};
