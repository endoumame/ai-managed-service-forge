/**
 * ContractShield ナレッジ自動改善ループ
 *
 * なぜ自動改善が必要か:
 * AIマネージドサービスの持続的価値は「使うほど賢くなる」仕組みにある。
 * ユーザーがAIのリスク判定を修正した場合、その差分を改善提案として記録し、
 * 管理者の承認を経てナレッジDBに反映する。
 * 自動反映せず人間の承認を挟むのは、ヒューマン・イン・ザ・ループの原則を守るため。
 */

import type { ClauseAnalysis, ImprovementProposal, KnowledgeEntry, RiskLevel } from "../types.ts";
import { addEntry, addProposal } from "./store.ts";
import type { KnowledgeDB } from "./store.ts";

const INCREMENT = 1;
const NONE_COUNT = 0;

let proposalCounter = NONE_COUNT;
let entryCounter = NONE_COUNT;

/** ユニークIDを生成する */
const generateProposalId = (): string => {
  proposalCounter += INCREMENT;
  return `proposal-${Date.now()}-${proposalCounter}`;
};

/** ユニークなエントリIDを生成する */
const generateEntryId = (): string => {
  entryCounter += INCREMENT;
  return `entry-${Date.now()}-${entryCounter}`;
};

/** リスク修正の入力パラメータ */
interface RiskCorrectionParams {
  db: KnowledgeDB;
  original: ClauseAnalysis;
  correctedLevel: RiskLevel;
  feedback: string;
}

/** 改善提案オブジェクトを構築する */
const buildProposal = (params: RiskCorrectionParams): ImprovementProposal => ({
  createdAt: new Date().toISOString(),
  description: `条項${params.original.clauseId}のリスク判定を「${params.original.riskLevel}」から「${params.correctedLevel}」に修正`,
  evidence: params.feedback,
  id: generateProposalId(),
  status: "pending",
  type: "risk_correction",
});

/** ナレッジエントリオブジェクトを構築する */
const buildEntry = (params: RiskCorrectionParams): KnowledgeEntry => ({
  approvedAt: null,
  category: "unknown",
  correctedRiskLevel: params.correctedLevel,
  createdAt: new Date().toISOString(),
  feedback: params.feedback,
  id: generateEntryId(),
  originalRiskLevel: params.original.riskLevel,
  pattern: `clauseId:${params.original.clauseId}`,
});

/**
 * ユーザーがリスク判定を修正した場合に改善提案を生成する。
 * 例: AIが「low」と判定したが、ユーザーが「high」に変更した場合。
 */
const proposeRiskCorrection = (params: RiskCorrectionParams): KnowledgeDB => {
  const withProposal = addProposal(params.db, buildProposal(params));
  return addEntry(withProposal, buildEntry(params));
};

/**
 * ナレッジDBから過去の修正パターンを検索し、
 * 該当するものがあればリスクレベルの調整を提案する。
 */
const suggestFromKnowledge = (db: KnowledgeDB, analysis: ClauseAnalysis): ClauseAnalysis => {
  const relevantEntries = db.entries.filter(
    (entry) =>
      entry.approvedAt !== null &&
      entry.correctedRiskLevel !== null &&
      entry.originalRiskLevel === analysis.riskLevel,
  );

  if (relevantEntries.length === NONE_COUNT) {
    return analysis;
  }

  const lastIndex = relevantEntries.length - INCREMENT;
  const latestEntry = relevantEntries[lastIndex];
  if (latestEntry.correctedRiskLevel === null) {
    return analysis;
  }

  return { ...analysis, riskLevel: latestEntry.correctedRiskLevel };
};

export { proposeRiskCorrection, suggestFromKnowledge };
export type { RiskCorrectionParams };
