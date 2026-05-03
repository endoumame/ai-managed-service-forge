// ナレッジストア: 取引先パターンの管理と検索
// インメモリ実装。永続化はシリアライズ/デシリアライズで外部に委譲

import type { KnowledgeEntry } from "../types.ts";

const ZERO = 0;
const JSON_INDENT = 2;

interface KnowledgeStore {
  entries: KnowledgeEntry[];
}

const isKnowledgeArray = (value: unknown): value is KnowledgeEntry[] =>
  Array.isArray(value) &&
  value.every(
    (item) =>
      typeof item === "object" && item !== null && "vendorName" in item && "pattern" in item,
  );

const createStore = (entries?: KnowledgeEntry[]): KnowledgeStore => ({
  entries: entries ?? [],
});

const deserialize = (json: string): KnowledgeStore => {
  const parsed: unknown = JSON.parse(json);
  if (!isKnowledgeArray(parsed)) {
    return createStore();
  }
  return createStore(parsed);
};

const serialize = (store: KnowledgeStore): string =>
  JSON.stringify(store.entries, null, JSON_INDENT);

const findByVendor = (store: KnowledgeStore, vendorName: string): KnowledgeEntry[] =>
  store.entries.filter((entry) => entry.vendorName === vendorName);

const addEntry = (store: KnowledgeStore, entry: KnowledgeEntry): KnowledgeStore =>
  createStore([...store.entries, entry]);

const updateEntry = (
  store: KnowledgeStore,
  vendorName: string,
  patch: Partial<KnowledgeEntry>,
): KnowledgeStore =>
  createStore(
    store.entries.map((entry) =>
      entry.vendorName === vendorName ? { ...entry, ...patch } : entry,
    ),
  );

const hasVendor = (store: KnowledgeStore, vendorName: string): boolean =>
  store.entries.some((entry) => entry.vendorName === vendorName);

const getStats = (store: KnowledgeStore): { totalEntries: number; vendors: string[] } => ({
  totalEntries: store.entries.length,
  vendors: store.entries.map((entry) => entry.vendorName),
});

const createInitialKnowledge = (): KnowledgeEntry[] => [
  {
    lastUsed: "2026-05-03",
    pattern: {
      accountCode: "6100",
      accountName: "消耗品費",
      itemKeywords: ["コピー用紙", "トナー", "文房具", "事務用品"],
      typicalTaxRate: 0.1,
    },
    source: "initial",
    usageCount: ZERO,
    vendorName: "株式会社サクラオフィス",
  },
  {
    lastUsed: "2026-05-03",
    pattern: {
      accountCode: "6600",
      accountName: "会議費",
      itemKeywords: ["弁当", "ケータリング", "飲料", "お茶"],
      typicalTaxRate: 0.08,
    },
    source: "initial",
    usageCount: ZERO,
    vendorName: "フレッシュデリカ",
  },
];

export {
  type KnowledgeStore,
  addEntry,
  createInitialKnowledge,
  createStore,
  deserialize,
  findByVendor,
  getStats,
  hasVendor,
  serialize,
  updateEntry,
};
