/**
 * ContractShield 共通型定義
 *
 * なぜ型を最初に定義するか:
 * ハーネス層・AIエージェント層・決定論的コード層の3層間の契約（interface）を
 * 型で明示することで、各層の責務境界を強制する。
 * これはAIマネージドサービスにおいて「AIに何を任せ、何を決定論的に処理するか」
 * の設計判断を型レベルで表現するためのアプローチ。
 */

// --- 契約書の構造 ---

/** 契約書全体 */
interface Contract {
  title: string;
  parties: string[];
  clauses: Clause[];
  rawText: string;
}

/** 個別の条項 */
interface Clause {
  id: string;
  number: string;
  title: string;
  content: string;
  category: ClauseCategory;
}

/**
 * 条項のカテゴリ（決定論的に分類可能な部分）
 *
 * confidentiality: 秘密保持
 * liability: 損害賠償
 * term: 契約期間
 * termination: 解約条件
 * ip: 知的財産権
 * payment: 対価・支払い
 * warranty: 保証
 * indemnification: 補償
 * force_majeure: 不可抗力
 * governing_law: 準拠法
 * dispute_resolution: 紛争解決
 * general: その他一般条項
 * unknown: 分類不能
 */
type ClauseCategory =
  | "confidentiality"
  | "liability"
  | "term"
  | "termination"
  | "ip"
  | "payment"
  | "warranty"
  | "indemnification"
  | "force_majeure"
  | "governing_law"
  | "dispute_resolution"
  | "general"
  | "unknown";

// --- リスク分析結果 ---

/** リスクレベル */
type RiskLevel = "high" | "medium" | "low" | "none";

/** 条項ごとのリスク分析結果 */
interface ClauseAnalysis {
  clauseId: string;
  riskLevel: RiskLevel;
  /** 0-100 */
  riskScore: number;
  findings: RiskFinding[];
  suggestedRevision: string | null;
  /** 0-1: AIの確信度 */
  confidence: number;
  status: "pending" | "analyzed" | "human_review_required" | "approved";
}

/** 個別のリスク発見事項 */
interface RiskFinding {
  type: string;
  description: string;
  severity: RiskLevel;
  relatedClause?: string;
}

// --- ハーネス管理 ---

/** ライフサイクルフックの種類 */
type HookPhase =
  | "before:parse"
  | "after:parse"
  | "before:analyze"
  | "after:analyze"
  | "before:report"
  | "after:report";

/** フック実行結果 */
interface HookResult {
  phase: HookPhase;
  passed: boolean;
  message: string;
  details?: Record<string, unknown>;
}

/** 終了条件チェックリスト */
interface CompletionChecklist {
  items: ChecklistItem[];
  allCompleted: boolean;
  completedAt: string | null;
}

/** チェックリスト項目 */
interface ChecklistItem {
  id: string;
  description: string;
  completed: boolean;
  verifiedBy: "harness" | "human";
  timestamp: string | null;
}

/** 必須チェック対象カテゴリ */
const REQUIRED_CATEGORIES: ClauseCategory[] = [
  "confidentiality",
  "liability",
  "term",
  "termination",
  "ip",
];

// --- レビューパイプライン ---

/** パイプライン全体の状態 */
interface ReviewPipeline {
  contractId: string;
  contract: Contract;
  analyses: ClauseAnalysis[];
  checklist: CompletionChecklist;
  hookResults: HookResult[];
  status: "parsing" | "analyzing" | "reviewing" | "completed" | "failed";
  report: ReviewReport | null;
  createdAt: string;
  updatedAt: string;
}

/** レビューレポート */
interface ReviewReport {
  contractTitle: string;
  totalClauses: number;
  analyzedClauses: number;
  riskSummary: {
    high: number;
    medium: number;
    low: number;
    none: number;
  };
  overallRiskScore: number;
  requiredCategoriesFound: ClauseCategory[];
  requiredCategoriesMissing: ClauseCategory[];
  highRiskClauses: {
    clauseNumber: string;
    clauseTitle: string;
    riskScore: number;
    findings: RiskFinding[];
    suggestedRevision: string | null;
  }[];
  humanReviewRequired: boolean;
  generatedAt: string;
}

// --- ナレッジ管理 ---

/** ナレッジDBのエントリ */
interface KnowledgeEntry {
  id: string;
  category: ClauseCategory;
  pattern: string;
  originalRiskLevel: RiskLevel;
  correctedRiskLevel: RiskLevel | null;
  feedback: string;
  approvedAt: string | null;
  createdAt: string;
}

/** 改善提案 */
interface ImprovementProposal {
  id: string;
  type: "risk_correction" | "new_pattern" | "checklist_addition";
  description: string;
  evidence: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

export {
  REQUIRED_CATEGORIES,
  type ChecklistItem,
  type Clause,
  type ClauseAnalysis,
  type ClauseCategory,
  type CompletionChecklist,
  type Contract,
  type HookPhase,
  type HookResult,
  type ImprovementProposal,
  type KnowledgeEntry,
  type ReviewPipeline,
  type ReviewReport,
  type RiskFinding,
  type RiskLevel,
};
