/**
 * ContractShield AIエージェント層
 *
 * なぜAIの役割を限定するか:
 * AIは「自然言語の意味理解」「リスクパターン認識」「修正案生成」に特化させ、
 * パース・計算・フォーマット等の決定論的処理は担当させない。
 * この境界を明確にすることで、AIのドリフトの影響範囲を最小化する。
 *
 * DEMO_MODE=mock の場合、Claude APIを呼ばずにモックレスポンスを返す。
 */

import type { Clause, ClauseAnalysis, RiskFinding, RiskLevel } from "../types.ts";

const MOCK_HIGH_RISK_SCORE = 85;
const MOCK_MEDIUM_RISK_SCORE = 45;
const MOCK_LOW_RISK_SCORE = 15;
const MOCK_HIGH_CONFIDENCE = 0.92;
const MOCK_MEDIUM_CONFIDENCE = 0.78;
const MOCK_LOW_CONFIDENCE = 0.85;

/** AIレスポンスの解析済み構造 */
interface AnalysisResponse {
  riskLevel: RiskLevel;
  riskScore: number;
  findings: RiskFinding[];
  suggestedRevision: string | null;
  confidence: number;
}

/** 損害賠償条項のモックレスポンス */
const MOCK_LIABILITY: AnalysisResponse = {
  confidence: MOCK_HIGH_CONFIDENCE,
  findings: [
    {
      description: "損害賠償の上限が定められていません。無制限の賠償責任を負う可能性があります",
      severity: "high",
      type: "賠償上限未設定",
    },
  ],
  riskLevel: "high",
  riskScore: MOCK_HIGH_RISK_SCORE,
  suggestedRevision:
    "本契約に基づく損害賠償の総額は、本契約に基づき支払われた対価の総額を上限とする。",
};

/** 解約条項のモックレスポンス */
const MOCK_TERMINATION: AnalysisResponse = {
  confidence: MOCK_MEDIUM_CONFIDENCE,
  findings: [
    {
      description: "一方的な解約条件が不均衡です。相手方のみに即時解約権が認められています",
      severity: "medium",
      type: "解約条件の不均衡",
    },
  ],
  riskLevel: "medium",
  riskScore: MOCK_MEDIUM_RISK_SCORE,
  suggestedRevision: null,
};

/** デフォルトのモックレスポンス（低リスク） */
const MOCK_DEFAULT: AnalysisResponse = {
  confidence: MOCK_LOW_CONFIDENCE,
  findings: [],
  riskLevel: "low",
  riskScore: MOCK_LOW_RISK_SCORE,
  suggestedRevision: null,
};

/** カテゴリ別モックレスポンスマップ */
const MOCK_RESPONSES: Record<string, AnalysisResponse> = {
  liability: MOCK_LIABILITY,
  termination: MOCK_TERMINATION,
};

/** モックレスポンスを返す（デモ用） */
const analyzeWithMock = (clause: Clause): AnalysisResponse =>
  MOCK_RESPONSES[clause.category] ?? MOCK_DEFAULT;

/** AnalysisResponseをClauseAnalysisに変換する */
const toClauseAnalysis = (clauseId: string, response: AnalysisResponse): ClauseAnalysis => {
  const needsHumanReview = response.riskLevel === "high";
  return {
    clauseId,
    confidence: response.confidence,
    findings: response.findings,
    riskLevel: response.riskLevel,
    riskScore: response.riskScore,
    status: needsHumanReview ? "human_review_required" : "analyzed",
    suggestedRevision: response.suggestedRevision,
  };
};

/** 単一条項を分析する（現在はモックのみ対応） */
const analyzeClause = async (clause: Clause): Promise<ClauseAnalysis> => {
  const response = await Promise.resolve(analyzeWithMock(clause));
  return toClauseAnalysis(clause.id, response);
};

/** 全条項を分析する */
const analyzeAllClauses = async (clauses: Clause[]): Promise<ClauseAnalysis[]> => {
  const results = await Promise.all(
    clauses.map(async (clause) => {
      const result = await analyzeClause(clause);
      return result;
    }),
  );
  return results;
};

export { analyzeAllClauses, analyzeClause };
