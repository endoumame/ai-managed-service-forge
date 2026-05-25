// ナレッジ管理: 自動改善ループ
// 同一取引先に対する矛盾するマッピングを検知し、改善提案を生成する
// 承認フローを通じてヒューマン・イン・ザ・ループを実現

import type { ImprovementProposal, KnowledgeEntry, KnowledgeStore } from "../types.ts";

const ID_RANDOM_SLICE_START = 2;
const ID_RANDOM_SLICE_END = 8;
const RADIX = 36;
const MIN_CONFLICT_COUNT = 2;
const FIRST_INDEX = 0;
const AFTER_FIRST = 1;

const generateId = (): string =>
  `imp_${Date.now()}_${Math.random().toString(RADIX).slice(ID_RANDOM_SLICE_START, ID_RANDOM_SLICE_END)}`;

interface AccountMapping {
  accountCode: string;
  accountName: string;
  frequency: number;
}

const groupByVendor = (entries: KnowledgeEntry[]): Map<string, AccountMapping[]> => {
  const groups = new Map<string, AccountMapping[]>();
  for (const entry of entries) {
    const key = entry.vendorName.toLowerCase();
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    const group = groups.get(key);
    group?.push({
      accountCode: entry.accountCode,
      accountName: entry.accountName,
      frequency: entry.frequency,
    });
  }
  return groups;
};

const buildConflictProposal = (
  vendorName: string,
  best: AccountMapping,
  other: AccountMapping,
): ImprovementProposal => ({
  createdAt: new Date().toISOString(),
  currentMapping: `${other.accountCode}:${other.accountName}`,
  id: generateId(),
  proposedMapping: `${best.accountCode}:${best.accountName}`,
  reason: `取引先「${vendorName}」に複数の勘定科目が割り当てられています。最頻出の「${best.accountName}（${best.accountCode}）」（使用回数: ${best.frequency}）への統一を提案します。現在「${other.accountName}（${other.accountCode}）」（使用回数: ${other.frequency}）も使用されています。`,
  status: "pending",
  type: "conflict_resolution",
  vendorName,
});

const isAlreadyProposed = (
  store: KnowledgeStore,
  vendorName: string,
  best: AccountMapping,
): boolean =>
  store.improvements.some(
    (proposal) =>
      proposal.vendorName === vendorName &&
      proposal.proposedMapping === `${best.accountCode}:${best.accountName}` &&
      proposal.status === "pending",
  );

const detectConflicts = (store: KnowledgeStore): ImprovementProposal[] => {
  const vendorGroups = groupByVendor(store.entries);
  const proposals: ImprovementProposal[] = [];

  for (const [vendorName, mappings] of vendorGroups) {
    if (mappings.length < MIN_CONFLICT_COUNT) {
      /* Skip single-mapping vendors */
    } else {
      const sorted = mappings.toSorted((left, right) => right.frequency - left.frequency);
      const best = sorted[FIRST_INDEX];
      for (const other of sorted.slice(AFTER_FIRST)) {
        if (!isAlreadyProposed(store, vendorName, best)) {
          proposals.push(buildConflictProposal(vendorName, best, other));
        }
      }
    }
  }

  return proposals;
};

const proposeNewMapping = (
  vendorName: string,
  accountCode: string,
  accountName: string,
): ImprovementProposal => ({
  createdAt: new Date().toISOString(),
  id: generateId(),
  proposedMapping: `${accountCode}:${accountName}`,
  reason: `新しい取引先「${vendorName}」を検出しました。勘定科目「${accountName}（${accountCode}）」へのマッピングを提案します。`,
  status: "pending",
  type: "new_mapping",
  vendorName,
});

const approveProposal = (store: KnowledgeStore, proposalId: string): KnowledgeStore => {
  const updatedImprovements = store.improvements.map((proposal) =>
    proposal.id === proposalId ? { ...proposal, status: "approved" as const } : proposal,
  );
  return { ...store, improvements: updatedImprovements };
};

const rejectProposal = (store: KnowledgeStore, proposalId: string): KnowledgeStore => {
  const updatedImprovements = store.improvements.map((proposal) =>
    proposal.id === proposalId ? { ...proposal, status: "rejected" as const } : proposal,
  );
  return { ...store, improvements: updatedImprovements };
};

const formatSingleProposal = (proposal: ImprovementProposal): string => {
  const typeLabel = proposal.type === "conflict_resolution" ? "矛盾解消" : "新規マッピング";
  let text = `[${proposal.id}] ${typeLabel}\n`;
  text += `  取引先: ${proposal.vendorName}\n`;
  if (typeof proposal.currentMapping === "string") {
    text += `  現在: ${proposal.currentMapping}\n`;
  }
  text += `  提案: ${proposal.proposedMapping}\n`;
  text += `  理由: ${proposal.reason}\n`;
  text += `  ステータス: ${proposal.status}\n\n`;
  return text;
};

const isEmpty = (arr: unknown[]): boolean => arr.length === 0; // eslint-disable-line no-magic-numbers

const formatProposalReport = (proposals: ImprovementProposal[]): string => {
  if (isEmpty(proposals)) {
    return "改善提案はありません。";
  }
  const header = "=== ナレッジ改善提案 ===\n\n";
  return header + proposals.map((proposal) => formatSingleProposal(proposal)).join("");
};

export {
  detectConflicts,
  proposeNewMapping,
  approveProposal,
  rejectProposal,
  formatProposalReport,
};
