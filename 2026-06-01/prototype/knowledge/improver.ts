// ナレッジ管理: 自動改善ループ
// 蓄積されたフィードバックから改善提案を自動生成する

import type { ImprovementProposal, KnowledgeFeedback } from "../types.ts";
import type { KnowledgeStore } from "./store.ts";
import { log } from "../logger.ts";

const MIN_FEEDBACK_COUNT = 2;
const INCREMENT = 1;

const buildAliasMap = (corrections: KnowledgeFeedback[]): Map<string, Set<string>> => {
  const aliasMap = new Map<string, Set<string>>();
  for (const fb of corrections) {
    const corrected = String(fb.correctedValue);
    const original = String(fb.originalValue);
    const existing = aliasMap.get(corrected) ?? new Set<string>();
    existing.add(original);
    aliasMap.set(corrected, existing);
  }
  return aliasMap;
};

const buildAliasProposal = (
  vendor: string,
  aliases: Set<string>,
  evidence: KnowledgeFeedback[],
): ImprovementProposal => ({
  description: `取引先「${vendor}」に以下のエイリアスを追加: ${[...aliases].join(", ")}`,
  evidence: evidence.filter((fb) => String(fb.correctedValue) === vendor),
  id: `VA-${Date.now()}-${vendor}`,
  proposedAt: new Date().toISOString(),
  status: "proposed",
  type: "vendor-alias",
});

const generateVendorAliasProposals = (store: KnowledgeStore): ImprovementProposal[] => {
  const vendorCorrections = store.feedbacks.filter((fb) => fb.field === "vendor");
  const aliasMap = buildAliasMap(vendorCorrections);
  const proposals: ImprovementProposal[] = [];

  for (const [vendor, aliases] of aliasMap) {
    if (aliases.size >= MIN_FEEDBACK_COUNT) {
      proposals.push(buildAliasProposal(vendor, aliases, vendorCorrections));
    }
  }
  return proposals;
};

const buildPatternMap = (
  corrections: KnowledgeFeedback[],
  allFeedbacks: KnowledgeFeedback[],
): Map<string, Map<string, number>> => {
  const patternMap = new Map<string, Map<string, number>>();
  for (const fb of corrections) {
    const vendorFb = allFeedbacks.find(
      (vfb) => vfb.invoiceId === fb.invoiceId && vfb.field === "vendor",
    );
    const vendor =
      typeof vendorFb?.correctedValue === "string" ? vendorFb.correctedValue : fb.invoiceId;
    const corrected = String(fb.correctedValue);
    const existing = patternMap.get(vendor) ?? new Map<string, number>();
    const NO_COUNT = 0;
    existing.set(corrected, (existing.get(corrected) ?? NO_COUNT) + INCREMENT);
    patternMap.set(vendor, existing);
  }
  return patternMap;
};

interface PatternProposalInput {
  vendor: string;
  accountCode: string;
  count: number;
  evidence: KnowledgeFeedback[];
}

const buildPatternProposal = (input: PatternProposalInput): ImprovementProposal => ({
  description: `取引先「${input.vendor}」のデフォルト勘定科目を「${input.accountCode}」に変更（${input.count}回の修正実績）`,
  evidence: input.evidence.filter((fb) => String(fb.correctedValue) === input.accountCode),
  id: `JP-${Date.now()}-${input.vendor}`,
  proposedAt: new Date().toISOString(),
  status: "proposed",
  type: "journal-pattern",
});

const generateJournalPatternProposals = (store: KnowledgeStore): ImprovementProposal[] => {
  const accountCorrections = store.feedbacks.filter((fb) => fb.field === "accountCode");
  const patternMap = buildPatternMap(accountCorrections, store.feedbacks);
  const proposals: ImprovementProposal[] = [];

  for (const [vendor, patterns] of patternMap) {
    for (const [accountCode, count] of patterns) {
      if (count >= MIN_FEEDBACK_COUNT) {
        proposals.push(
          buildPatternProposal({ accountCode, count, evidence: accountCorrections, vendor }),
        );
      }
    }
  }
  return proposals;
};

const generateAllProposals = (store: KnowledgeStore): ImprovementProposal[] => {
  const vendorProposals = generateVendorAliasProposals(store);
  const journalProposals = generateJournalPatternProposals(store);
  const allProposals = [...vendorProposals, ...journalProposals];

  log(`\n  [Improver] 改善提案を${allProposals.length}件生成しました:`);
  for (const proposal of allProposals) {
    log(`    - [${proposal.type}] ${proposal.description}`);
  }

  return allProposals;
};

export { generateAllProposals, generateJournalPatternProposals, generateVendorAliasProposals };
