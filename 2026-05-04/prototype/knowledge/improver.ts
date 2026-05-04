import type { JournalCandidate, KnowledgeRule, KnowledgeStore } from "../types.ts";
import { addRule, updateAmountStats } from "./store.ts";
import { logger } from "../logger.ts";

const INITIAL_FREQUENCY = 1;
const INCREMENT = 1;
let ruleCounter = 0;

const generateRuleId = (): string => {
  ruleCounter += INCREMENT;
  return `rule-${Date.now()}-${ruleCounter}`;
};

interface CorrectionInput {
  vendorName: string;
  itemDescription: string;
  correctedAccount: string;
  correctedAccountName: string;
}

const proposeRuleFromCorrection = (
  store: KnowledgeStore,
  correction: CorrectionInput,
): KnowledgeStore => {
  const newRule: KnowledgeRule = {
    accountCode: correction.correctedAccount,
    accountName: correction.correctedAccountName,
    approvedBy: null,
    frequency: INITIAL_FREQUENCY,
    id: generateRuleId(),
    itemPattern: correction.itemDescription,
    lastUsed: new Date().toISOString(),
    status: "proposed",
    vendorPattern: correction.vendorName,
  };
  return addRule(store, newRule);
};

const learnFromApproval = (store: KnowledgeStore, candidate: JournalCandidate): KnowledgeStore => {
  let updatedStore = store;
  for (const entry of candidate.entries) {
    updatedStore = updateAmountStats(updatedStore, candidate.invoiceId, entry.debitAmount);
  }
  logger.info(`学習完了: ${candidate.invoiceId} の仕訳パターンを記録`);
  return updatedStore;
};

const getPendingProposals = (store: KnowledgeStore): KnowledgeRule[] =>
  store.rules.filter((rule) => rule.status === "proposed");

export type { CorrectionInput };
export { getPendingProposals, learnFromApproval, proposeRuleFromCorrection };
