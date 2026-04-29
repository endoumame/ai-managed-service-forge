import type { KnowledgeEntry } from "../types.ts";

const INITIAL_FREQUENCY = 1;
const INDENT = 2;

interface FileAdapter {
  exists(path: string): boolean;
  readEntries(path: string): KnowledgeEntry[];
  write(path: string, content: string): void;
}

interface KnowledgeStore {
  entries: Map<string, KnowledgeEntry>;
  fileAdapter: FileAdapter;
  filePath: string;
}

const createStore = (filePath: string, fileAdapter: FileAdapter): KnowledgeStore => {
  const entries = new Map<string, KnowledgeEntry>();
  if (fileAdapter.exists(filePath)) {
    for (const entry of fileAdapter.readEntries(filePath)) {
      entries.set(entry.vendorName, entry);
    }
  }
  return { entries, fileAdapter, filePath };
};

const save = (store: KnowledgeStore): void => {
  const data = [...store.entries.values()];
  store.fileAdapter.write(store.filePath, JSON.stringify(data, null, INDENT));
};

const getVendorPatterns = (store: KnowledgeStore, vendorName: string): KnowledgeEntry | undefined =>
  store.entries.get(vendorName);

const getVendorHistory = (store: KnowledgeStore, vendorName: string): number[] => {
  const entry = store.entries.get(vendorName);
  if (!entry) {
    return [];
  }
  return entry.patterns.map((pt) => pt.frequency);
};

interface RecordApprovalInput {
  accountCode: string;
  accountName: string;
  itemKeyword: string;
  store: KnowledgeStore;
  vendorName: string;
}

const updateExistingEntry = (existing: KnowledgeEntry, input: RecordApprovalInput): void => {
  const pattern = existing.patterns.find((pt) => pt.itemKeyword === input.itemKeyword);
  if (pattern) {
    pattern.frequency += INITIAL_FREQUENCY;
    pattern.accountCode = input.accountCode;
    pattern.accountName = input.accountName;
  } else {
    existing.patterns.push({
      accountCode: input.accountCode,
      accountName: input.accountName,
      frequency: INITIAL_FREQUENCY,
      itemKeyword: input.itemKeyword,
    });
  }
  existing.lastUpdated = new Date().toISOString();
};

const createNewEntry = (input: RecordApprovalInput): KnowledgeEntry => ({
  lastUpdated: new Date().toISOString(),
  patterns: [
    {
      accountCode: input.accountCode,
      accountName: input.accountName,
      frequency: INITIAL_FREQUENCY,
      itemKeyword: input.itemKeyword,
    },
  ],
  vendorName: input.vendorName,
});

const recordApproval = (input: RecordApprovalInput): void => {
  const existing = input.store.entries.get(input.vendorName);
  if (existing) {
    updateExistingEntry(existing, input);
  } else {
    input.store.entries.set(input.vendorName, createNewEntry(input));
  }
  save(input.store);
};

export type { KnowledgeStore, FileAdapter };
export { createStore, save, getVendorPatterns, getVendorHistory, recordApproval };
