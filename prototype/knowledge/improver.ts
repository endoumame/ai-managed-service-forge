/*
 * ナレッジ改善層: 自動改善提案の生成
 *
 * ユーザーの修正パターンを分析し、ルール更新を提案する。
 * 提案は自動反映されず、必ず人間の承認を経る（ヒューマン・イン・ザ・ループ）。
 */

import type { ImprovementProposal, KnowledgeEntry } from "../types.ts";

const MIN_FREQUENCY_FOR_PROPOSAL = 3;
const MIN_ENTRIES_FOR_CONFLICT = 1;
const INCREMENT = 1;

let proposalCounter = 0;

const generateProposalId = (): string => {
  proposalCounter += INCREMENT;
  return `proposal-${proposalCounter}`;
};

interface Correction {
  vendor: string;
  description: string;
  fromAccount: string;
  toAccount: string;
}

type CorrectionCount = { count: number } & Correction;

/** 修正履歴を集計し、キーごとの出現回数を返す */
const aggregateCorrections = (corrections: Correction[]): Map<string, CorrectionCount> => {
  const counts = new Map<string, CorrectionCount>();

  for (const correction of corrections) {
    const key = `${correction.vendor}::${correction.description}::${correction.toAccount}`;
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(key, { count: 1, ...correction });
    }
  }

  return counts;
};

/** 集計結果から提案を生成 */
const buildProposalFromCount = (
  data: { count: number } & Correction,
  existingRule: KnowledgeEntry | undefined,
): ImprovementProposal => ({
  currentRule: existingRule,
  description: `取引先「${data.vendor}」の「${data.description}」の勘定科目を「${data.toAccount}」に${existingRule ? "更新" : "設定"}`,
  evidence: [`${data.count}回の修正履歴に基づく提案`],
  id: generateProposalId(),
  proposedRule: {
    account: data.toAccount,
    description: data.description,
    frequency: data.count,
    lastUsed: new Date().toISOString(),
    vendor: data.vendor,
  },
  status: "pending",
  type: existingRule ? "update_mapping" : "new_mapping",
});

/** 修正履歴から改善提案を生成する */
const generateProposals = (
  currentKnowledge: KnowledgeEntry[],
  corrections: Correction[],
): ImprovementProposal[] => {
  const counts = aggregateCorrections(corrections);

  return [...counts.values()]
    .filter((data) => data.count >= MIN_FREQUENCY_FOR_PROPOSAL)
    .map((data) => {
      const existingRule = currentKnowledge.find(
        (entry) => entry.vendor === data.vendor && entry.description === data.description,
      );
      return buildProposalFromCount(data, existingRule);
    });
};

/** ナレッジエントリをvendor::descriptionキーでグルーピング */
const groupByVendorDesc = (knowledge: KnowledgeEntry[]): Map<string, KnowledgeEntry[]> => {
  const grouped = new Map<string, KnowledgeEntry[]>();
  for (const entry of knowledge) {
    const key = `${entry.vendor}::${entry.description}`;
    const existing = grouped.get(key) ?? [];
    existing.push(entry);
    grouped.set(key, existing);
  }
  return grouped;
};

/** グループ内の矛盾を1件の提案に変換 */
const buildConflictProposal = (entries: KnowledgeEntry[]): ImprovementProposal | null => {
  const accounts = [...new Set(entries.map((ent) => ent.account))];
  if (accounts.length <= MIN_ENTRIES_FOR_CONFLICT) {
    return null;
  }

  let [mostFrequent] = entries;
  for (const entry of entries) {
    if (entry.frequency > mostFrequent.frequency) {
      mostFrequent = entry;
    }
  }
  return {
    description: `取引先「${mostFrequent.vendor}」の「${mostFrequent.description}」に複数の勘定科目が存在: ${accounts.join(", ")}`,
    evidence: entries.map((ent) => `${ent.account} (使用回数: ${ent.frequency})`),
    id: generateProposalId(),
    proposedRule: mostFrequent,
    status: "pending",
    type: "conflict_detected",
  };
};

/** 矛盾検知: 同一取引先×品目に対して異なる勘定科目が使われている場合を検出 */
const detectConflicts = (knowledge: KnowledgeEntry[]): ImprovementProposal[] => {
  const grouped = groupByVendorDesc(knowledge);

  return [...grouped.values()]
    .filter((entries) => entries.length > MIN_ENTRIES_FOR_CONFLICT)
    .map((entries) => buildConflictProposal(entries))
    .filter((proposal): proposal is ImprovementProposal => proposal !== null);
};

export { detectConflicts, generateProposals };
export type { Correction };
