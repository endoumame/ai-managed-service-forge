/**
 * ナレッジ自動改善ループ
 *
 * ユーザーの修正を蓄積し、一定回数に達したら
 * ルール化を提案する。提案は人間が承認するまで適用されない。
 */

import { loadRules, saveRules } from "./store.ts";
import type { ImprovementProposal } from "../types.ts";

const PROPOSAL_THRESHOLD = 3;
const NOT_FOUND = -1;

interface CorrectionRecord {
  vendorName: string;
  description: string;
  originalAccountCode: string;
  correctedAccountCode: string;
  correctedAccountName: string;
}

/** 修正履歴をキーでグループ化する */
const groupCorrections = (corrections: CorrectionRecord[]): Map<string, CorrectionRecord[]> => {
  const grouped = new Map<string, CorrectionRecord[]>();
  for (const correction of corrections) {
    const key = `${correction.vendorName}::${correction.correctedAccountCode}`;
    const existing = grouped.get(key) ?? [];
    existing.push(correction);
    grouped.set(key, existing);
  }
  return grouped;
};

/** 修正レコード群から1つの改善提案を組み立てる */
const buildProposal = (records: CorrectionRecord[]): ImprovementProposal => {
  const FIRST_INDEX = 0;
  const first = records[FIRST_INDEX];
  const existingRules = loadRules();
  const currentRule = existingRules.find((rule) => rule.vendorName === first.vendorName) ?? null;
  return {
    createdAt: new Date().toISOString(),
    currentRule,
    description: `取引先「${first.vendorName}」の勘定科目を「${first.correctedAccountName}」に更新`,
    evidence: records.map(
      (rec) => `${rec.description}: ${rec.originalAccountCode} → ${rec.correctedAccountCode}`,
    ),
    id: `proposal-${Date.now()}`,
    proposedRule: {
      accountCode: first.correctedAccountCode,
      accountName: first.correctedAccountName,
      approved: false,
      descriptionPattern: first.description,
      lastUsed: new Date().toISOString(),
      occurrences: records.length,
      vendorName: first.vendorName,
    },
    type: currentRule === null ? "new_rule" : "update_rule",
  };
};

/** 修正履歴から改善提案を生成する */
const generateProposals = (corrections: CorrectionRecord[]): ImprovementProposal[] => {
  const grouped = groupCorrections(corrections);
  const proposals: ImprovementProposal[] = [];
  for (const [, records] of grouped) {
    if (records.length >= PROPOSAL_THRESHOLD) {
      proposals.push(buildProposal(records));
    }
  }
  return proposals;
};

/** 承認された提案をナレッジストアに反映する */
const applyApprovedProposal = (proposal: ImprovementProposal): void => {
  const rules = loadRules();
  const existingIdx = rules.findIndex(
    (rule) => rule.vendorName === proposal.proposedRule.vendorName,
  );
  const approvedRule = { ...proposal.proposedRule, approved: true };
  if (existingIdx === NOT_FOUND) {
    rules.push(approvedRule);
  } else {
    rules[existingIdx] = approvedRule;
  }
  saveRules(rules);
};

export { type CorrectionRecord, generateProposals, applyApprovedProposal };
