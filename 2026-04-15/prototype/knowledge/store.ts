/**
 * ナレッジストア — 仕訳パターンの蓄積と参照
 *
 * なぜこの実装か:
 * AIエージェントが過去の仕訳パターンを参照できるようにすることで、
 * 同一取引先の請求書に対して一貫した分類を行える。
 * また、ユーザーの修正行動をフィードバックとして蓄積し、
 * 改善提案を生成するデータ基盤となる。
 *
 * プロトタイプではインメモリ＋JSONシリアライズで実装し、
 * 本番ではDBに置き換える想定。
 */

import type { ImprovementProposal, VendorPattern } from "../types.js";

// 改善提案を生成する閾値（同一修正がこの回数蓄積されたら提案）
const PROPOSAL_THRESHOLD = 2;
const INCREMENT = 1;
// JSONシリアライズ時のインデントスペース数
const JSON_INDENT = 2;

interface KnowledgeState {
  patterns: VendorPattern[];
  proposals: ImprovementProposal[];
  corrections: CorrectionRecord[];
}

interface CorrectionRecord {
  vendor: string;
  itemKeyword: string;
  originalAccountCode: string;
  correctedAccountCode: string;
  correctedAccountName: string;
  timestamp: string;
}

/**
 * ナレッジストアを初期状態で作成する。
 * 初期パターンデータを注入可能。
 */
const createKnowledgeStore = (initialPatterns: VendorPattern[] = []): KnowledgeState => ({
  corrections: [],
  patterns: [...initialPatterns],
  proposals: [],
});

/**
 * 取引先と品目キーワードに一致するパターンを検索する。
 */
const findPatterns = (state: KnowledgeState, vendor: string): VendorPattern[] =>
  state.patterns.filter((pat) => pat.vendor === vendor);

/**
 * 同一パターンの修正回数を集計する。
 */
const countMatchingCorrections = (
  corrections: CorrectionRecord[],
  target: CorrectionRecord,
): number => {
  let count = 0;
  for (const rec of corrections) {
    if (rec.vendor === target.vendor && rec.correctedAccountCode === target.correctedAccountCode) {
      count += INCREMENT;
    }
  }
  return count;
};

/**
 * 修正から改善提案を生成する。重複がある場合はカウントを更新して null を返す。
 */
const buildProposal = (
  state: KnowledgeState,
  correction: CorrectionRecord,
  matchCount: number,
): ImprovementProposal | null => {
  const existing = state.proposals.find(
    (prop) =>
      prop.vendor === correction.vendor &&
      prop.proposedAccountCode === correction.correctedAccountCode,
  );

  if (existing) {
    existing.correctionCount = matchCount;
    return null;
  }

  return {
    correctionCount: matchCount,
    createdAt: new Date().toISOString(),
    currentAccountCode: correction.originalAccountCode,
    id: `PROP-${Date.now()}`,
    itemKeyword: correction.itemKeyword,
    proposedAccountCode: correction.correctedAccountCode,
    proposedAccountName: correction.correctedAccountName,
    status: "pending",
    vendor: correction.vendor,
  };
};

/**
 * ユーザーの修正を記録し、必要に応じて改善提案を生成する。
 * 同一の修正パターンが閾値を超えた場合、ルール化提案をキューに追加。
 */
const recordCorrection = (
  state: KnowledgeState,
  correction: CorrectionRecord,
): ImprovementProposal | null => {
  state.corrections.push(correction);
  const matchCount = countMatchingCorrections(state.corrections, correction);

  if (matchCount < PROPOSAL_THRESHOLD) {
    return null;
  }

  const proposal = buildProposal(state, correction, matchCount);
  if (proposal) {
    state.proposals.push(proposal);
  }
  return proposal;
};

/**
 * 改善提案を承認し、パターンとしてストアに反映する。
 */
const approveProposal = (state: KnowledgeState, proposalId: string): boolean => {
  const proposal = state.proposals.find((prop) => prop.id === proposalId);
  if (!proposal || proposal.status !== "pending") {
    return false;
  }

  proposal.status = "approved";

  state.patterns.push({
    accountCode: proposal.proposedAccountCode,
    accountName: proposal.proposedAccountName,
    frequency: proposal.correctionCount,
    itemKeyword: proposal.itemKeyword,
    lastUsed: new Date().toISOString(),
    source: "learned",
    vendor: proposal.vendor,
  });

  return true;
};

/**
 * 未承認の改善提案一覧を取得する。
 */
const getPendingProposals = (state: KnowledgeState): ImprovementProposal[] =>
  state.proposals.filter((prop) => prop.status === "pending");

/**
 * ナレッジの状態をJSONシリアライズ可能な形式で返す。
 */
const serializeState = (state: KnowledgeState): string => JSON.stringify(state, null, JSON_INDENT);

export {
  approveProposal,
  createKnowledgeStore,
  findPatterns,
  getPendingProposals,
  recordCorrection,
  serializeState,
};
export type { CorrectionRecord, KnowledgeState };
