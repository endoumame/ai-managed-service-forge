/**
 * ContractShield ナレッジストア
 *
 * なぜナレッジを永続化するか:
 * AIマネージドサービスの核心的価値は「時間とともに賢くなる」こと。
 * ユーザーのフィードバック（リスク判定の修正、修正案の調整）を蓄積し、
 * 次回のレビューで活用することで、継続的な品質向上を実現する。
 * プロトタイプではインメモリストアを使用する。
 */

import type { ImprovementProposal, KnowledgeEntry } from "../types.ts";

interface KnowledgeDB {
  entries: KnowledgeEntry[];
  proposals: ImprovementProposal[];
  version: number;
}

const INITIAL_VERSION = 1;

/** 空のナレッジDBを生成する */
const createDB = (): KnowledgeDB => ({
  entries: [],
  proposals: [],
  version: INITIAL_VERSION,
});

/** 新しいナレッジエントリを追加する */
const addEntry = (db: KnowledgeDB, entry: KnowledgeEntry): KnowledgeDB => ({
  ...db,
  entries: [...db.entries, entry],
});

/** 改善提案を追加する */
const addProposal = (db: KnowledgeDB, proposal: ImprovementProposal): KnowledgeDB => ({
  ...db,
  proposals: [...db.proposals, proposal],
});

/** 改善提案を承認する */
const approveProposal = (db: KnowledgeDB, proposalId: string): KnowledgeDB => ({
  ...db,
  proposals: db.proposals.map((prop) =>
    prop.id === proposalId ? { ...prop, status: "approved" as const } : prop,
  ),
});

/** 保留中の改善提案を取得する */
const getPendingProposals = (db: KnowledgeDB): ImprovementProposal[] =>
  db.proposals.filter((prop) => prop.status === "pending");

/** ナレッジDBをJSON文字列にシリアライズする */
const serializeDB = (db: KnowledgeDB): string => {
  const INDENT = 2;
  return JSON.stringify(db, null, INDENT);
};

/** パースされたオブジェクトがKnowledgeDB構造を持つか検証する */
const isKnowledgeDB = (value: unknown): value is KnowledgeDB =>
  typeof value === "object" &&
  value !== null &&
  "entries" in value &&
  "proposals" in value &&
  "version" in value;

/** JSON文字列からナレッジDBをデシリアライズする */
const deserializeDB = (json: string): KnowledgeDB => {
  const parsed: unknown = JSON.parse(json);
  if (isKnowledgeDB(parsed)) {
    return parsed;
  }
  return createDB();
};

export {
  addEntry,
  addProposal,
  approveProposal,
  createDB,
  deserializeDB,
  getPendingProposals,
  serializeDB,
};
export type { KnowledgeDB };
