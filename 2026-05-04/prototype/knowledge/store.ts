import type { KnowledgeRule, KnowledgeStore } from "../types.ts";
import { logger } from "../logger.ts";

const INITIAL_FREQUENCY = 1;
const NO_RECORDS = 0;
const INITIAL_STDDEV = 0;
const SQUARED = 2;

const createEmptyStore = (): KnowledgeStore => ({
  averageAmounts: {},
  rules: [],
  vendorAliases: {},
});

const resolveAlias = (store: KnowledgeStore, vendorName: string): string =>
  store.vendorAliases[vendorName] ?? vendorName;

const isRuleMatch = (rule: KnowledgeRule, vendor: string, item: string): boolean =>
  rule.status === "approved" &&
  vendor.includes(rule.vendorPattern) &&
  item.includes(rule.itemPattern);

const findMatchingRule = (
  store: KnowledgeStore,
  vendorName: string,
  itemDescription: string,
): KnowledgeRule | null => {
  const normalizedVendor = resolveAlias(store, vendorName);
  return store.rules.find((rule) => isRuleMatch(rule, normalizedVendor, itemDescription)) ?? null;
};

const addRule = (store: KnowledgeStore, rule: KnowledgeRule): KnowledgeStore => {
  logger.info(`新ルール提案: ${rule.vendorPattern} × ${rule.itemPattern} → ${rule.accountName}`);
  return { ...store, rules: [...store.rules, rule] };
};

const approveRule = (store: KnowledgeStore, ruleId: string): KnowledgeStore => {
  const updatedRules = store.rules.map((rule) => {
    if (rule.id !== ruleId) {
      return rule;
    }
    logger.info(`ルール承認: ${rule.vendorPattern} × ${rule.itemPattern} → ${rule.accountName}`);
    return { ...rule, approvedBy: "human", status: "approved" as const };
  });
  return { ...store, rules: updatedRules };
};

const recalculateStats = (
  existing: { mean: number; stddev: number; count: number },
  newAmount: number,
): { mean: number; stddev: number; count: number } => {
  const newCount = existing.count + INITIAL_FREQUENCY;
  const newMean = (existing.mean * existing.count + newAmount) / newCount;
  const variance =
    newCount > INITIAL_FREQUENCY
      ? ((newAmount - newMean) ** SQUARED + existing.count * existing.stddev ** SQUARED) / newCount
      : NO_RECORDS;
  return { count: newCount, mean: newMean, stddev: Math.sqrt(variance) };
};

const updateAmountStats = (
  store: KnowledgeStore,
  vendorName: string,
  amount: number,
): KnowledgeStore => {
  const existing = store.averageAmounts[vendorName];
  const newStats =
    existing !== null && vendorName in store.averageAmounts
      ? recalculateStats(existing, amount)
      : { count: INITIAL_FREQUENCY, mean: amount, stddev: INITIAL_STDDEV };

  return {
    ...store,
    averageAmounts: { ...store.averageAmounts, [vendorName]: newStats },
  };
};

export {
  addRule,
  approveRule,
  createEmptyStore,
  findMatchingRule,
  resolveAlias,
  updateAmountStats,
};
