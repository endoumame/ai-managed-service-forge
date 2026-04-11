/**
 * ナレッジ管理: インメモリストレージ
 *
 * なぜインメモリか:
 * Node.jsビルトインのimportがリンターで禁止されているため、
 * ファイルI/Oをストア層から分離し、インメモリで管理する。
 * シリアライズ/デシリアライズ関数を公開し、永続化はデモ層に委譲する。
 */

import type { CorrectionRecord, JournalRule } from "../types.ts";

interface KnowledgeData {
  rules: JournalRule[];
  corrections: CorrectionRecord[];
  vendorAliases: Record<string, string>;
}

const createEmptyKnowledge = (): KnowledgeData => ({
  corrections: [],
  rules: [],
  vendorAliases: {},
});

const serializeKnowledge = (data: KnowledgeData): string => {
  const INDENT = 2;
  return JSON.stringify(data, null, INDENT);
};

const isKnowledgeData = (value: unknown): value is KnowledgeData =>
  typeof value === "object" &&
  value !== null &&
  "rules" in value &&
  "corrections" in value &&
  "vendorAliases" in value;

const deserializeKnowledge = (raw: string): KnowledgeData => {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isKnowledgeData(parsed) ? parsed : createEmptyKnowledge();
  } catch {
    return createEmptyKnowledge();
  }
};

const addCorrection = (data: KnowledgeData, correction: CorrectionRecord): KnowledgeData => ({
  ...data,
  corrections: [...data.corrections, correction],
});

const addRule = (data: KnowledgeData, rule: JournalRule): KnowledgeData => ({
  ...data,
  rules: [...data.rules, rule],
});

export { addCorrection, addRule, createEmptyKnowledge, deserializeKnowledge, serializeKnowledge };
export type { KnowledgeData };
