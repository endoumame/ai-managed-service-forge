// ナレッジ管理: ストレージ
// 「取引先→勘定科目」のマッピングをJSONファイルで永続化する
// 処理するたびに学習データが蓄積される自己改善の基盤

import type { KnowledgeEntry, KnowledgeStore } from "../types.ts";
// eslint-disable-next-line import/no-nodejs-modules -- prototype uses synchronous fs for simplicity
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const DEFAULT_STORE_PATH = new URL("data.json", import.meta.url).pathname;
const INITIAL_FREQUENCY = 1;
const JSON_INDENT = 2;
const FIRST_INDEX = 0;

const isEmpty = (arr: unknown[]): boolean => arr.length === 0; // eslint-disable-line no-magic-numbers

/* eslint-disable typescript/strict-boolean-expressions, typescript/no-unsafe-call, typescript/no-unsafe-assignment, typescript/no-unsafe-argument, typescript/no-unsafe-type-assertion -- node:fs lacks types in prototype */
const loadStore = (path?: string): KnowledgeStore => {
  const filePath = path ?? DEFAULT_STORE_PATH;
  if (!existsSync(filePath)) {
    return { entries: [], improvements: [] };
  }
  const raw = readFileSync(filePath, "utf8");
  return JSON.parse(raw) as KnowledgeStore;
};

const saveStore = (store: KnowledgeStore, path?: string): void => {
  const filePath = path ?? DEFAULT_STORE_PATH;
  // eslint-disable-next-line unicorn/no-null -- JSON.stringify requires null for replacer
  writeFileSync(filePath, JSON.stringify(store, null, JSON_INDENT), "utf8");
};
/* eslint-enable typescript/strict-boolean-expressions, typescript/no-unsafe-call, typescript/no-unsafe-assignment, typescript/no-unsafe-argument, typescript/no-unsafe-type-assertion */

const lookupVendor = (store: KnowledgeStore, vendorName: string): KnowledgeEntry[] => {
  const normalized = vendorName.trim().toLowerCase();
  return store.entries.filter(
    (entry) =>
      entry.vendorName.toLowerCase().includes(normalized) ||
      normalized.includes(entry.vendorName.toLowerCase()),
  );
};

interface MappingInput {
  vendorName: string;
  accountCode: string;
  accountName: string;
}

const recordMapping = (store: KnowledgeStore, mapping: MappingInput): KnowledgeStore => {
  const { vendorName, accountCode, accountName } = mapping;
  const existing = store.entries.find(
    (entry) => entry.vendorName === vendorName && entry.accountCode === accountCode,
  );

  if (existing) {
    existing.frequency += INITIAL_FREQUENCY;
    existing.lastUsed = new Date().toISOString();
    return store;
  }

  const newEntry: KnowledgeEntry = {
    accountCode,
    accountName,
    frequency: INITIAL_FREQUENCY,
    lastUsed: new Date().toISOString(),
    vendorName,
  };

  return {
    ...store,
    entries: [...store.entries, newEntry],
  };
};

const getBestMapping = (store: KnowledgeStore, vendorName: string): KnowledgeEntry | null => {
  // eslint-disable-line unicorn/no-null -- return null instead of undefined per no-undefined rule
  const matches = lookupVendor(store, vendorName);
  if (isEmpty(matches)) {
    return null; // eslint-disable-line unicorn/no-null -- return null instead of undefined per no-undefined rule
  }
  return matches.toSorted((left, right) => right.frequency - left.frequency)[FIRST_INDEX];
};

export { loadStore, saveStore, lookupVendor, recordMapping, getBestMapping };
