/**
 * ContractShield レポート生成（決定論的処理）
 *
 * AIが生成した分析結果を構造化レポートにフォーマットする。
 * レポートの構造・計算・フォーマットは全て決定論的に処理し、
 * AIの出力に依存しない確実性を担保する。
 */

import type { ClauseAnalysis, Contract, ReviewReport } from "../types.ts";
import { calculateOverallRiskScore, checkRequiredCategories } from "./rules.ts";

/** AIの確信度がこの閾値未満なら人間レビュー必須 */
const CONFIDENCE_THRESHOLD = 0.7;

/** 「該当なし」を表す数値（マジックナンバー回避） */
const NONE_COUNT = 0;

/**
 * リスクレベルごとの条項数を集計する
 */
const summarizeRisk = (analyses: ClauseAnalysis[]): Record<string, number> => {
  const summary = { high: 0, low: 0, medium: 0, none: 0 };
  for (const entry of analyses) {
    summary[entry.riskLevel] += 1;
  }
  return summary;
};

/**
 * 高リスク条項を抽出してレポート用フォーマットに変換する
 */
const extractHighRiskClauses = (
  contract: Contract,
  analyses: ClauseAnalysis[],
): ReviewReport["highRiskClauses"] =>
  analyses
    .filter((entry) => entry.riskLevel === "high")
    .map((entry) => {
      const clause = contract.clauses.find((cl) => cl.id === entry.clauseId);
      return clause
        ? {
            clauseNumber: clause.number,
            clauseTitle: clause.title,
            findings: entry.findings,
            riskScore: entry.riskScore,
            suggestedRevision: entry.suggestedRevision,
          }
        : null;
    })
    .filter((item) => item !== null);

/**
 * レビューレポートを生成する
 */
const generateReport = (contract: Contract, analyses: ClauseAnalysis[]): ReviewReport => {
  const { found, missing } = checkRequiredCategories(contract.clauses);
  const riskSummary = summarizeRisk(analyses);
  const highRiskClauses = extractHighRiskClauses(contract, analyses);

  return {
    analyzedClauses: analyses.filter((an) => an.status !== "pending").length,
    contractTitle: contract.title,
    generatedAt: new Date().toISOString(),
    highRiskClauses,
    humanReviewRequired:
      riskSummary.high > NONE_COUNT ||
      missing.length > NONE_COUNT ||
      analyses.some((an) => an.confidence < CONFIDENCE_THRESHOLD),
    overallRiskScore: calculateOverallRiskScore(analyses),
    requiredCategoriesFound: found,
    requiredCategoriesMissing: missing,
    riskSummary,
    totalClauses: contract.clauses.length,
  };
};

/**
 * レポートヘッダー部分をMarkdownに変換する
 */
const formatHeader = (report: ReviewReport): string[] => [
  "# ContractShield レビューレポート",
  "",
  `**契約書:** ${report.contractTitle}`,
  `**生成日時:** ${report.generatedAt}`,
  `**全体リスクスコア:** ${report.overallRiskScore}/100`,
  "",
  "## リスクサマリー",
  "",
  "| レベル | 条項数 |",
  "|--------|--------|",
  `| 高 | ${report.riskSummary.high} |`,
  `| 中 | ${report.riskSummary.medium} |`,
  `| 低 | ${report.riskSummary.low} |`,
  `| なし | ${report.riskSummary.none} |`,
  "",
  `**分析済み条項:** ${report.analyzedClauses}/${report.totalClauses}`,
  "",
];

/**
 * 必須条項チェックセクションをMarkdownに変換する
 */
const formatRequiredCategories = (report: ReviewReport): string[] => {
  const lines = ["## 必須条項チェック", ""];
  for (const cat of report.requiredCategoriesFound) {
    lines.push(`- [x] ${cat}`);
  }
  for (const cat of report.requiredCategoriesMissing) {
    lines.push(`- [ ] **${cat}（未検出）**`);
  }
  lines.push("");
  return lines;
};

/**
 * 単一の高リスク条項をMarkdown行に変換する
 */
const formatOneHighRiskClause = (clause: ReviewReport["highRiskClauses"][number]): string[] => {
  const lines = [
    `### 第${clause.clauseNumber}条: ${clause.clauseTitle}`,
    `**リスクスコア:** ${clause.riskScore}/100`,
    "",
    ...clause.findings.map((finding) => `- **[${finding.severity}]** ${finding.description}`),
  ];
  if (clause.suggestedRevision !== null) {
    lines.push("", "**修正案:**", `> ${clause.suggestedRevision}`);
  }
  lines.push("");
  return lines;
};

/**
 * 高リスク条項セクションをMarkdownに変換する
 */
const formatHighRiskClauses = (report: ReviewReport): string[] => {
  if (report.highRiskClauses.length === NONE_COUNT) {
    return [];
  }
  return ["## 高リスク条項", "", ...report.highRiskClauses.flatMap(formatOneHighRiskClause)];
};

/**
 * レポートを人間が読みやすいMarkdown形式にフォーマットする
 */
const formatReportAsMarkdown = (report: ReviewReport): string => {
  const sections = [
    ...formatHeader(report),
    ...formatRequiredCategories(report),
    ...formatHighRiskClauses(report),
  ];

  if (report.humanReviewRequired) {
    sections.push(
      "---",
      "**[要人間レビュー]** 高リスク条項または未検出の必須条項があります。法務担当者による確認が必要です。",
    );
  }

  return sections.join("\n");
};

export { formatReportAsMarkdown, generateReport };
