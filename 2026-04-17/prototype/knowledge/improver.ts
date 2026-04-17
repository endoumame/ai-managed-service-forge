// ナレッジ管理: 自動改善ループ
// フィードバックを分析し、チェックルールの改善提案を生成

import type { KnowledgeBase, RuleAdjustment } from "./store.js";

interface ImprovementProposal {
  category: string;
  currentWeight: number;
  proposedDelta: number;
  reason: string;
  confidence: number;
  feedbackCount: number;
}

interface CategoryStats {
  ups: number;
  downs: number;
  total: number;
}

const MIN_FEEDBACK_FOR_PROPOSAL = 3;
const SCORE_ADJUSTMENT_UNIT = 1;
const HIGH_OVERRIDE_RATE = 0.7;
const LOW_OVERRIDE_RATE = 0.3;
const HIGH_CONFIDENCE = 0.8;
const MEDIUM_CONFIDENCE = 0.5;
const PERCENTAGE = 100;
const INITIAL_WEIGHT = 0;

const updateStats = (
  stats: CategoryStats,
  fb: { correctedScore: number | null; originalScore: number },
): void => {
  stats.total += SCORE_ADJUSTMENT_UNIT;
  if (typeof fb.correctedScore === "number") {
    if (fb.correctedScore > fb.originalScore) {
      stats.ups += SCORE_ADJUSTMENT_UNIT;
    } else if (fb.correctedScore < fb.originalScore) {
      stats.downs += SCORE_ADJUSTMENT_UNIT;
    }
  }
};

// フィードバックをカテゴリ別に集計
const aggregateFeedback = (kb: KnowledgeBase): Map<string, CategoryStats> => {
  const result = new Map<string, CategoryStats>();
  for (const review of kb.reviews) {
    for (const fb of review.feedback) {
      const stats = result.get(fb.category) ?? { downs: 0, total: 0, ups: 0 };
      updateStats(stats, fb);
      result.set(fb.category, stats);
    }
  }
  return result;
};

const computeRates = (stats: CategoryStats): { upRate: number; downRate: number } => ({
  downRate: stats.downs / stats.total,
  upRate: stats.ups / stats.total,
});

const buildProposalBase = (
  category: string,
  stats: CategoryStats,
): Omit<ImprovementProposal, "confidence" | "proposedDelta" | "reason"> => ({
  category,
  currentWeight: INITIAL_WEIGHT,
  feedbackCount: stats.total,
});

// カテゴリの統計から提案を生成
const createProposal = (category: string, stats: CategoryStats): ImprovementProposal | null => {
  if (stats.total < MIN_FEEDBACK_FOR_PROPOSAL) {
    return null;
  }

  const { upRate, downRate } = computeRates(stats);

  if (upRate > HIGH_OVERRIDE_RATE) {
    return {
      ...buildProposalBase(category, stats),
      confidence: HIGH_CONFIDENCE,
      proposedDelta: SCORE_ADJUSTMENT_UNIT,
      reason: `${stats.total}件中${stats.ups}件でスコアが上方修正。リスク評価が過小な可能性。`,
    };
  }
  if (downRate > HIGH_OVERRIDE_RATE) {
    return {
      ...buildProposalBase(category, stats),
      confidence: HIGH_CONFIDENCE,
      proposedDelta: -SCORE_ADJUSTMENT_UNIT,
      reason: `${stats.total}件中${stats.downs}件でスコアが下方修正。リスク評価が過大な可能性。`,
    };
  }
  if (upRate > LOW_OVERRIDE_RATE || downRate > LOW_OVERRIDE_RATE) {
    return {
      ...buildProposalBase(category, stats),
      confidence: MEDIUM_CONFIDENCE,
      proposedDelta: upRate > downRate ? SCORE_ADJUSTMENT_UNIT : -SCORE_ADJUSTMENT_UNIT,
      reason: `修正傾向あり（上方${stats.ups}件、下方${stats.downs}件/${stats.total}件）。確信度は中程度。`,
    };
  }
  return null;
};

// フィードバックから改善提案を生成
const generateImprovementProposals = (kb: KnowledgeBase): ImprovementProposal[] => {
  const feedbackByCategory = aggregateFeedback(kb);
  const proposals: ImprovementProposal[] = [];
  for (const [category, stats] of feedbackByCategory) {
    const proposal = createProposal(category, stats);
    if (proposal) {
      proposals.push(proposal);
    }
  }
  return proposals;
};

// 提案を承認してルール調整に反映
const approveProposal = (kb: KnowledgeBase, proposal: ImprovementProposal): KnowledgeBase => {
  const adjustment: RuleAdjustment = {
    approved: true,
    category: proposal.category,
    reason: proposal.reason,
    timestamp: new Date().toISOString(),
    weightDelta: proposal.proposedDelta,
  };
  return { ...kb, ruleAdjustments: [...kb.ruleAdjustments, adjustment] };
};

// 改善提案のフォーマット（ヒューマン・イン・ザ・ループ用）
const formatProposals = (proposals: ImprovementProposal[]): string => {
  if (!proposals.some(Boolean)) {
    return "改善提案はありません（フィードバックデータが不足しています）。";
  }

  const lines: string[] = ["═══ ナレッジ改善提案 ═══"];
  for (const [idx, prop] of proposals.entries()) {
    const direction = prop.proposedDelta > INITIAL_WEIGHT ? "↑ 引き上げ" : "↓ 引き下げ";
    lines.push(
      `\n提案 ${idx + SCORE_ADJUSTMENT_UNIT}:`,
      `  カテゴリ: ${prop.category}`,
      `  変更: リスクスコア重み ${direction}`,
      `  理由: ${prop.reason}`,
      `  確信度: ${Math.round(prop.confidence * PERCENTAGE)}%`,
      `  フィードバック数: ${prop.feedbackCount}件`,
      "  → 承認しますか？ [Y/n]",
    );
  }
  return lines.join("\n");
};

export { type ImprovementProposal, generateImprovementProposals, approveProposal, formatProposals };
