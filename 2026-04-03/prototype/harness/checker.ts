/**
 * ハーネス層 — 品質チェッカー
 *
 * afterMatchフックとは別に、より詳細な品質分析を提供する。
 * 経理担当者が「このマッチング結果は信頼できるか」を判断するための
 * 補助情報を生成する。
 */

import type { MatchResult } from "../types.ts";

interface QualityReport {
  /** 全体の消込率（自動確定 / 全入金） */
  autoConfirmRate: number;
  /** AI候補の平均信頼度 */
  averageCandidateConfidence: number;
  /** 要調査件数 */
  investigationCount: number;
  /** 警告メッセージ */
  warnings: string[];
}

/** 品質閾値 */
const LOW_RECONCILE_RATE = 0.5;
const HIGH_INVESTIGATION_RATE = 0.3;
const LOW_CONFIDENCE_THRESHOLD = 0.5;
const PERCENT_MULTIPLIER = 100;
const ZERO = 0;

/** カテゴリ別の件数を集計する */
interface CategoryCounts {
  total: number;
  autoConfirmed: number;
  candidates: MatchResult[];
  investigation: number;
}

const countByCategory = (results: MatchResult[]): CategoryCounts => ({
  autoConfirmed: results.filter((res) => res.category === "auto_confirmed").length,
  candidates: results.filter((res) => res.category === "candidate"),
  investigation: results.filter((res) => res.category === "investigation_required").length,
  total: results.length,
});

/** 候補の信頼度統計を計算する */
interface ConfidenceStats {
  average: number;
  lowCount: number;
}

const calcConfidenceStats = (candidates: MatchResult[]): ConfidenceStats => {
  const totalConf = candidates.reduce((sum, res) => sum + (res.confidence ?? ZERO), ZERO);
  const average = candidates.length > ZERO ? totalConf / candidates.length : ZERO;
  const lowCount = candidates.filter(
    (res) => (res.confidence ?? ZERO) < LOW_CONFIDENCE_THRESHOLD,
  ).length;
  return { average, lowCount };
};

/** 集計結果から警告メッセージを生成する */
const buildWarnings = (counts: CategoryCounts, stats: ConfidenceStats, rate: number): string[] => {
  const warnings: string[] = [];
  if (rate < LOW_RECONCILE_RATE) {
    warnings.push(
      `消込率が${(rate * PERCENT_MULTIPLIER).toFixed(ZERO)}%と低い水準です。新規取引先が増えた可能性があります。`,
    );
  }
  if (counts.investigation > counts.total * HIGH_INVESTIGATION_RATE) {
    warnings.push(
      `要調査件数が全体の30%以上（${counts.investigation}/${counts.total}件）です。入金データの品質を確認してください。`,
    );
  }
  if (stats.lowCount > ZERO) {
    warnings.push(`信頼度50%未満の候補が${stats.lowCount}件あります。慎重に確認してください。`);
  }
  return warnings;
};

/**
 * マッチング結果の品質レポートを生成する
 *
 * これはAIの自己評価ではなく、決定論的な集計。
 * 「AIが95%と言っている」のではなく「ハーネスが数えた結果95%だった」という客観的データ。
 */
const generateQualityReport = (results: MatchResult[]): QualityReport => {
  const counts = countByCategory(results);
  const autoConfirmRate = counts.total > ZERO ? counts.autoConfirmed / counts.total : ZERO;
  const stats = calcConfidenceStats(counts.candidates);
  const warnings = buildWarnings(counts, stats, autoConfirmRate);

  return {
    autoConfirmRate,
    averageCandidateConfidence: stats.average,
    investigationCount: counts.investigation,
    warnings,
  };
};

export { generateQualityReport };
export type { QualityReport };
