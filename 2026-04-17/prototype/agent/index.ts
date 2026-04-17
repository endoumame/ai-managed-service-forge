/* oxlint-disable @typescript-eslint/no-unsafe-assignment -- 動的importの型推論がtsconfigなしでは不完全 */
/* oxlint-disable @typescript-eslint/no-unsafe-call -- 動的importの型推論がtsconfigなしでは不完全 */
/* oxlint-disable @typescript-eslint/no-unsafe-member-access -- 動的importの型推論がtsconfigなしでは不完全 */
/* oxlint-disable @typescript-eslint/no-unsafe-type-assertion -- 動的importの型推論がtsconfigなしでは不完全 */
/* oxlint-disable @typescript-eslint/no-unsafe-argument -- 動的importの型推論がtsconfigなしでは不完全 */
/* oxlint-disable @typescript-eslint/strict-boolean-expressions -- 動的importの型推論がtsconfigなしでは不完全 */
// AIエージェント層: 契約書の意味理解・リスク推定
// 推論のアップサイドが大きい部分（自然言語理解・文脈分析）をAIが担当

import type { HookContext } from "../harness/lifecycle.js";

interface ClauseAnalysis {
  title: string;
  quote: string;
  riskScore: number;
  riskReason: string;
  suggestion: string;
}

interface AgentConfig {
  apiKey: string | null;
  model: string;
  useMock: boolean;
}

const DEFAULT_MODEL = "claude-sonnet-4-20250514";

const RISK_LOW = 2;
const RISK_MEDIUM = 3;
const RISK_HIGH = 5;
const MAX_TOKENS = 4096;
const NOT_FOUND = -1;
const STRING_START = 0;
const FIRST_MATCH_INDEX = 0;

const QUOTE_CONTEXT_RADIUS = 50;

// 契約書テキストからキーワード周辺を抽出するヘルパー
const extractQuoteNear = (text: string, keyword: string): string | null => {
  const idx = text.indexOf(keyword);
  if (idx === NOT_FOUND) {
    return null;
  }
  const start = Math.max(idx - QUOTE_CONTEXT_RADIUS, STRING_START);
  const end = Math.min(idx + keyword.length + QUOTE_CONTEXT_RADIUS, text.length);
  return text.slice(start, end).trim();
};

const ANALYSIS_PROMPT = `あなたは契約書レビューの専門家です。以下の契約書を分析し、各条項のリスクを評価してください。

## 出力形式（JSON）
{
  "clauses": [
    {
      "title": "条項名",
      "quote": "契約書からの正確な引用（原文のまま）",
      "riskScore": 1-5の整数,
      "riskReason": "リスクの理由",
      "suggestion": "改善提案"
    }
  ],
  "summary": "契約書全体の総合評価（2-3文）"
}

## 注意事項
- quoteは契約書の原文をそのまま引用すること（改変しない）
- riskScoreは1（低リスク）〜5（高リスク）
- 全ての主要条項を網羅すること

## 契約書本文
`;

// モックレスポンス（APIキーなしでもデモ可能にするため）
const createMockResponse = (
  contractText: string,
): { clauses: ClauseAnalysis[]; summary: string } => {
  const hasDamageClause = contractText.includes("損害賠償");
  const hasConfidentiality = contractText.includes("秘密保持") || contractText.includes("機密");

  return {
    clauses: [
      {
        quote: extractQuoteNear(contractText, "秘密保持") ?? "（該当条項なし）",
        riskReason: hasConfidentiality ? "標準的な秘密保持条項" : "秘密保持条項が不足",
        riskScore: hasConfidentiality ? RISK_LOW : RISK_HIGH,
        suggestion: hasConfidentiality ? "期間の明記を確認" : "秘密保持条項の追加を推奨",
        title: "秘密保持",
      },
      {
        quote: extractQuoteNear(contractText, "損害賠償") ?? "（該当条項なし）",
        riskReason: hasDamageClause ? "賠償上限の確認が必要" : "損害賠償条項が不足",
        riskScore: hasDamageClause ? RISK_MEDIUM : RISK_HIGH,
        suggestion: hasDamageClause ? "賠償上限額の妥当性を確認" : "損害賠償条項の追加を推奨",
        title: "損害賠償",
      },
    ],
    summary: "モックモードでの分析結果です。実際のAI分析にはANTHROPIC_API_KEYの設定が必要です。",
  };
};

// Claude APIを使った契約書分析
const analyzeWithClaude = async (
  contractText: string,
  config: AgentConfig,
): Promise<{ clauses: ClauseAnalysis[]; summary: string }> => {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: config.apiKey ?? "" });

  const response = await client.messages.create({
    max_tokens: MAX_TOKENS,
    messages: [{ content: `${ANALYSIS_PROMPT}${contractText}`, role: "user" }],
    model: config.model,
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("AIからテキストレスポンスが得られませんでした");
  }

  const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("AIレスポンスからJSONを抽出できませんでした");
  }

  return JSON.parse(jsonMatch[FIRST_MATCH_INDEX]) as { clauses: ClauseAnalysis[]; summary: string };
};

// エージェントのメインエントリポイント
const analyzeContract = async (ctx: HookContext, config: AgentConfig): Promise<HookContext> => {
  const result = config.useMock
    ? createMockResponse(ctx.contractText)
    : await analyzeWithClaude(ctx.contractText, config);

  const aiRiskScores: Record<string, number> = {};
  for (const clause of result.clauses) {
    aiRiskScores[clause.title] = clause.riskScore;
  }

  return {
    ...ctx,
    data: {
      ...ctx.data,
      aiAnalysis: result.summary,
      aiRiskScores,
      extractedClauses: result.clauses,
    },
  };
};

const createAgentConfig = (): AgentConfig => {
  const apiKey = process.env["ANTHROPIC_API_KEY"] ?? null;
  const useMock = process.env["MOCK_AI"] === "true" || apiKey === null;
  return { apiKey, model: DEFAULT_MODEL, useMock };
};

export {
  type ClauseAnalysis,
  type AgentConfig,
  analyzeContract,
  createAgentConfig,
  createMockResponse,
};
