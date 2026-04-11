/**
 * ナレッジ管理: 自動改善ループ
 *
 * なぜ自動改善が必要か:
 * AIマネージドサービスは「使うほど賢くなる」ことが内製との差別化ポイント。
 * ユーザーの仕訳修正を蓄積し、一定条件でルール更新を提案する。
 *
 * なぜ「提案」であり「自動適用」ではないか:
 * ヒューマン・イン・ザ・ループの設計原則。
 * 経理の仕訳ルールは企業ごとのポリシーに依存するため、
 * 人間の承認なしにルールを変更してはならない。
 */

import type { CorrectionRecord, ImprovementProposal, JournalRule } from "../types.ts";

const RULE_PROMOTION_THRESHOLD = 3;
const KEY_SEPARATOR = "::";
const LAST_INDEX = -1;

const groupByPattern = (corrections: CorrectionRecord[]): Map<string, CorrectionRecord[]> => {
  const patternMap = new Map<string, CorrectionRecord[]>();
  for (const correction of corrections) {
    const key = `${correction.vendorId}${KEY_SEPARATOR}${correction.category}${KEY_SEPARATOR}${correction.correctedAccountCode}`;
    const existing = patternMap.get(key) ?? [];
    existing.push(correction);
    patternMap.set(key, existing);
  }
  return patternMap;
};

const buildProposal = (key: string, records: CorrectionRecord[]): ImprovementProposal => {
  const [vendorId, category, accountCode] = key.split(KEY_SEPARATOR);
  const latest = records.at(LAST_INDEX);
  return {
    createdAt: new Date().toISOString(),
    description:
      `取引先"${vendorId}" × 品目"${category}"で${records.length}回同じ修正` +
      `(→${accountCode} ${latest?.correctedAccountName ?? ""})が確認されました。ルール昇格を提案します。`,
    evidence: records,
    id: `proposal-${Date.now()}-${vendorId}`,
    proposedRule: {
      category,
      debitAccountCode: accountCode,
      debitAccountName: latest?.correctedAccountName ?? "",
      source: "learned",
      vendorId: vendorId ?? "*",
    },
    status: "pending",
    type: "new_rule",
  };
};

/**
 * 修正履歴を分析し、ルール更新の提案を生成する
 *
 * 「同一取引先×同一品目で3回以上同じ修正」→ルール昇格を提案
 */
const analyzeCorrections = (corrections: CorrectionRecord[]): ImprovementProposal[] => {
  const patternMap = groupByPattern(corrections);
  const proposals: ImprovementProposal[] = [];

  for (const [key, records] of patternMap) {
    if (records.length >= RULE_PROMOTION_THRESHOLD) {
      proposals.push(buildProposal(key, records));
    }
  }

  return proposals;
};

/**
 * 承認された提案からルールを生成する
 */
const proposalToRule = (proposal: ImprovementProposal, ruleId: string): JournalRule | null => {
  if (proposal.status !== "approved" || !proposal.proposedRule) {
    return null;
  }

  return {
    category: proposal.proposedRule.category ?? "*",
    creditAccountCode: "2100",
    creditAccountName: "買掛金",
    debitAccountCode: proposal.proposedRule.debitAccountCode ?? "6999",
    debitAccountName: proposal.proposedRule.debitAccountName ?? "未分類費用",
    id: ruleId,
    source: "learned",
    taxCategory: "課税仕入10%",
    usageCount: 0,
    vendorId: proposal.proposedRule.vendorId ?? "*",
  };
};

export { analyzeCorrections, proposalToRule };
