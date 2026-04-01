/*
 * ナレッジ管理層: 仕訳パターンの蓄積と参照
 *
 * ユーザーの修正履歴を「取引先×品目→勘定科目」のマッピングとして蓄積。
 * これがAIマネージドサービスの「自己改善ループ」の基盤。
 * プロトタイプではインメモリストアを使用。本番ではDB等に永続化。
 */

import type { KnowledgeEntry } from "../types.ts";

const FREQUENCY_INCREMENT = 1;
const INITIAL_FREQUENCY = 1;

interface KnowledgeStore {
  getAll: () => KnowledgeEntry[];
  set: (newEntries: KnowledgeEntry[]) => void;
}

/** インメモリナレッジストア */
const createKnowledgeStore = (initial: KnowledgeEntry[] = []): KnowledgeStore => {
  let entries = [...initial];

  return {
    getAll: (): KnowledgeEntry[] => [...entries],
    set: (newEntries: KnowledgeEntry[]): void => {
      entries = [...newEntries];
    },
  };
};

/**
 * 修正履歴からナレッジを更新する
 * 同一の取引先×品目の既存エントリがあれば頻度を更新、なければ新規追加
 */
const updateKnowledge = (
  entries: KnowledgeEntry[],
  update: { vendor: string; description: string; account: string },
): KnowledgeEntry[] => {
  const existing = entries.find(
    (entry) => entry.vendor === update.vendor && entry.description === update.description,
  );

  if (existing) {
    return entries.map((entry) =>
      entry.vendor === update.vendor && entry.description === update.description
        ? {
            ...entry,
            account: update.account,
            frequency: entry.frequency + FREQUENCY_INCREMENT,
            lastUsed: new Date().toISOString(),
          }
        : entry,
    );
  }

  return [
    ...entries,
    {
      account: update.account,
      description: update.description,
      frequency: INITIAL_FREQUENCY,
      lastUsed: new Date().toISOString(),
      vendor: update.vendor,
    },
  ];
};

export { createKnowledgeStore, updateKnowledge };
