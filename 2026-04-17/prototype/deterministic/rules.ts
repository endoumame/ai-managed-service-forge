// 決定論的コード層: ルールベース処理
// AIに任せず確実に実行する契約書チェックロジック

const RISK_HIGH = 5;
const RISK_MEDIUM = 3;
const RISK_LOW = 1;

interface RequiredClauseRule {
  category: string;
  keywords: string[];
  riskIfMissing: number;
}

interface ClauseCheckResult {
  category: string;
  found: boolean;
  riskScore: number;
  matchedKeyword: string | null;
}

interface RiskScoreResult {
  category: string;
  score: number;
  reason: string;
}

// 必須条項のルール定義（決定論的パターンマッチ）
const REQUIRED_CLAUSE_RULES: RequiredClauseRule[] = [
  {
    category: "秘密保持",
    keywords: ["秘密保持", "機密", "守秘義務", "confidential"],
    riskIfMissing: RISK_HIGH,
  },
  {
    category: "損害賠償",
    keywords: ["損害賠償", "損害の賠償", "賠償責任"],
    riskIfMissing: RISK_HIGH,
  },
  {
    category: "契約解除",
    keywords: ["契約の解除", "解除", "解約", "終了"],
    riskIfMissing: RISK_MEDIUM,
  },
  {
    category: "不可抗力",
    keywords: ["不可抗力", "天災", "force majeure"],
    riskIfMissing: RISK_MEDIUM,
  },
  {
    category: "準拠法",
    keywords: ["準拠法", "適用法", "governing law"],
    riskIfMissing: RISK_LOW,
  },
  {
    category: "管轄裁判所",
    keywords: ["管轄", "裁判所", "jurisdiction"],
    riskIfMissing: RISK_LOW,
  },
];

// 必須条項の存在チェック（キーワードパターンマッチング）
const checkRequiredClauses = (contractText: string): ClauseCheckResult[] =>
  REQUIRED_CLAUSE_RULES.map((rule) => {
    const matched = rule.keywords.find((kw) => contractText.includes(kw));
    return {
      category: rule.category,
      found: typeof matched === "string",
      matchedKeyword: matched ?? null,
      riskScore: typeof matched === "string" ? RISK_LOW : rule.riskIfMissing,
    };
  });

// リスクスコアの決定論的算出
const calculateDeterministicRiskScores = (
  contractText: string,
): Record<string, RiskScoreResult> => {
  const results: Record<string, RiskScoreResult> = {};
  const clauseResults = checkRequiredClauses(contractText);

  for (const result of clauseResults) {
    results[result.category] = {
      category: result.category,
      reason: result.found ? `"${result.matchedKeyword ?? ""}" を検出` : "必須条項が見つかりません",
      score: result.riskScore,
    };
  }

  return results;
};

// レポートフォーマット生成（決定論的）
const formatReviewReport = (
  clauseResults: ClauseCheckResult[],
  riskScores: Record<string, RiskScoreResult>,
  aiAnalysis: string,
): string => {
  const header = [
    "╔═══════════════════════════════════════╗",
    "║  ContractGuard レビューレポート       ║",
    "╚═══════════════════════════════════════╝",
  ];

  const clauseSection = [
    "\n■ 必須条項チェック",
    ...clauseResults.map((cr) => {
      const mark = cr.found ? "✓" : "✗";
      const detail = cr.found ? `検出: "${cr.matchedKeyword ?? ""}"` : "未検出";
      return `  [${mark}] ${cr.category}: ${detail} (リスク: ${cr.riskScore}/5)`;
    }),
  ];

  const riskSection = [
    "\n■ リスクスコアサマリー",
    ...Object.values(riskScores).map((rs) => `  ${rs.category}: ${rs.score}/5 - ${rs.reason}`),
  ];

  const aiSection = ["\n■ AI分析結果", aiAnalysis];

  return [...header, ...clauseSection, ...riskSection, ...aiSection].join("\n");
};

export {
  type RequiredClauseRule,
  type ClauseCheckResult,
  type RiskScoreResult,
  REQUIRED_CLAUSE_RULES,
  checkRequiredClauses,
  calculateDeterministicRiskScores,
  formatReviewReport,
};
