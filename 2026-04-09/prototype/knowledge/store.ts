/**
 * ナレッジストア
 *
 * ユーザーの修正履歴を蓄積し、次回の推定に反映する。
 * プロトタイプではインメモリストレージを使用し、
 * 外部からシリアライズ/デシリアライズのコールバックを注入可能にする。
 */

import type { KnowledgeEntry } from "../types.ts";
import { log } from "../logger.ts";

/** JSON文字列のインデント幅 */
const JSON_INDENT = 2;

/** 空のナレッジエントリ */
const createEmptyKnowledge = (): KnowledgeEntry => ({
  accountMappings: [],
  processedInvoices: [],
  vendorAliases: {},
});

/** パース結果がKnowledgeEntry構造を持つか検証する */
const isKnowledgeEntry = (data: unknown): data is KnowledgeEntry =>
  typeof data === "object" &&
  data !== null &&
  "accountMappings" in data &&
  "processedInvoices" in data;

/** JSON文字列からナレッジを復元する */
const parseKnowledge = (json: string): KnowledgeEntry => {
  try {
    const parsed: unknown = JSON.parse(json);
    if (isKnowledgeEntry(parsed)) {
      return parsed;
    }
    log("[Knowledge] 不正なナレッジ構造。空のナレッジを使用");
    return createEmptyKnowledge();
  } catch {
    log("[Knowledge] JSONパース失敗。空のナレッジを使用");
    return createEmptyKnowledge();
  }
};

/** ナレッジをJSON文字列にシリアライズする */
const serializeKnowledge = (knowledge: KnowledgeEntry): string =>
  JSON.stringify(knowledge, null, JSON_INDENT);

export { createEmptyKnowledge, parseKnowledge, serializeKnowledge };
