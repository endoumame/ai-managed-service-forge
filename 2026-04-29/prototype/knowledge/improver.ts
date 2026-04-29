import type { ImprovementProposal } from "../types.ts";
import type { KnowledgeStore } from "./store.ts";

const RULE_PROPOSAL_THRESHOLD = 3;
const EMPTY_LENGTH = 0;
const OFFSET = 1;

const generateProposals = (store: KnowledgeStore): ImprovementProposal[] => {
  const proposals: ImprovementProposal[] = [];

  for (const [vendorName, entry] of store.entries) {
    for (const pattern of entry.patterns) {
      if (pattern.frequency >= RULE_PROPOSAL_THRESHOLD) {
        proposals.push({
          description: `取引先「${vendorName}」の品目「${pattern.itemKeyword}」は過去${pattern.frequency}回、科目「${pattern.accountName}(${pattern.accountCode})」で承認されています。デフォルトルールとして追加を提案します。`,
          evidence: `承認回数: ${pattern.frequency}回 (閾値: ${RULE_PROPOSAL_THRESHOLD}回)`,
          proposedChange: {
            accountCode: pattern.accountCode,
            accountName: pattern.accountName,
            itemKeyword: pattern.itemKeyword,
            vendorName,
          },
          type: "new_rule",
        });
      }
    }
  }

  return proposals;
};

const formatProposals = (proposals: ImprovementProposal[]): string => {
  if (proposals.length === EMPTY_LENGTH) {
    return "現在、改善提案はありません。";
  }
  return proposals
    .map((pr, idx) => {
      const num = idx + OFFSET;
      return [`提案 ${num}: [${pr.type}]`, `  ${pr.description}`, `  根拠: ${pr.evidence}`].join(
        "\n",
      );
    })
    .join("\n\n");
};

export { RULE_PROPOSAL_THRESHOLD, generateProposals, formatProposals };
