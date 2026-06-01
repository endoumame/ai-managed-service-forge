// ナレッジ管理: インメモリストレージ
// プロトタイプでは実行中のメモリにフィードバックと改善提案を保持する

import type { ImprovementProposal, KnowledgeFeedback } from "../types.ts";
import { log } from "../logger.ts";

interface KnowledgeStore {
  feedbacks: KnowledgeFeedback[];
  proposals: ImprovementProposal[];
  vendorAliases: Record<string, string[]>;
  journalPatterns: Record<string, { accountCode: string; accountName: string }>;
}

interface JournalPatternInput {
  vendorName: string;
  accountCode: string;
  accountName: string;
}

const createStore = (): KnowledgeStore => ({
  feedbacks: [],
  journalPatterns: {},
  proposals: [],
  vendorAliases: {},
});

const INDENT_SPACES = 2;

const serialize = (store: KnowledgeStore): string => JSON.stringify(store, null, INDENT_SPACES);

const isKnowledgeStore = (value: unknown): value is KnowledgeStore =>
  typeof value === "object" && value !== null && "feedbacks" in value && "proposals" in value;

const deserialize = (json: string): KnowledgeStore => {
  const parsed: unknown = JSON.parse(json);
  if (isKnowledgeStore(parsed)) {
    return parsed;
  }
  return createStore();
};

const addFeedback = (store: KnowledgeStore, feedback: KnowledgeFeedback): void => {
  store.feedbacks.push(feedback);
  log(`  [Knowledge] フィードバック記録: ${feedback.invoiceId} / ${feedback.field}`);
};

const addVendorAlias = (store: KnowledgeStore, canonicalName: string, alias: string): void => {
  const existing = store.vendorAliases[canonicalName];
  if (Array.isArray(existing)) {
    if (!existing.includes(alias)) {
      existing.push(alias);
    }
  } else {
    store.vendorAliases[canonicalName] = [alias];
  }
  log(`  [Knowledge] 取引先エイリアス追加: ${canonicalName} ← ${alias}`);
};

const addJournalPattern = (store: KnowledgeStore, input: JournalPatternInput): void => {
  store.journalPatterns[input.vendorName] = {
    accountCode: input.accountCode,
    accountName: input.accountName,
  };
  log(
    `  [Knowledge] 仕訳パターン記録: ${input.vendorName} → ${input.accountCode} ${input.accountName}`,
  );
};

export {
  type KnowledgeStore,
  addFeedback,
  addJournalPattern,
  addVendorAlias,
  createStore,
  deserialize,
  serialize,
};
