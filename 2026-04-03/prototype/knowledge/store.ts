/**
 * ナレッジストア — 振込名義→取引先マッピング辞書
 *
 * なぜJSONファイルベースか:
 * プロトタイプ段階ではDBは過剰。JSONファイルなら人間が直接確認・編集でき、
 * ナレッジの蓄積と改善プロセスを目に見える形でデモできる。
 * 本番ではSQLite→PostgreSQL等にスケールする想定。
 */

/* eslint-disable import/no-nodejs-modules -- CLIプロトタイプのためNode.js標準モジュールが必要 */
import { dirname, resolve } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { KnowledgeEntry } from "../types.ts";
import { fileURLToPath } from "node:url";
/* eslint-enable import/no-nodejs-modules */

const JSON_INDENT = 2;
const DATE_PART_INDEX = 0;

// eslint-disable-next-line typescript/no-unsafe-call, typescript/no-unsafe-assignment, typescript/no-unsafe-type-assertion -- Node.js path resolution
const currentDir: string = dirname(fileURLToPath(import.meta.url)) as string;
// eslint-disable-next-line typescript/no-unsafe-call, typescript/no-unsafe-assignment, typescript/no-unsafe-type-assertion -- Node.js path resolution
const STORE_PATH: string = resolve(currentDir, "../data/knowledge.json") as string;

/** カナ名義の正規化（全角→半角、スペース除去等） */
const normalizePayerName = (name: string): string =>
  name
    .replaceAll(/\s+/g, "")
    .replaceAll(/[（(]/g, "(")
    .replaceAll(/[）)]/g, ")")
    .replaceAll("㈱", "(株)")
    .replaceAll("㈲", "(有)")
    .toUpperCase();

const loadKnowledge = (): KnowledgeEntry[] => {
  // eslint-disable-next-line typescript/no-unsafe-call, typescript/strict-boolean-expressions -- Node.js fs API
  if (!existsSync(STORE_PATH)) {
    return [];
  }
  // eslint-disable-next-line typescript/no-unsafe-call, typescript/no-unsafe-assignment, typescript/no-unsafe-type-assertion -- Node.js fs API
  const raw: string = readFileSync(STORE_PATH, "utf8") as string;
  // eslint-disable-next-line typescript/no-unsafe-type-assertion -- JSONパース結果の型アサーション
  return JSON.parse(raw) as KnowledgeEntry[];
};

const saveKnowledge = (entries: KnowledgeEntry[]): void => {
  // eslint-disable-next-line typescript/no-unsafe-call -- Node.js fs API
  writeFileSync(STORE_PATH, JSON.stringify(entries, null, JSON_INDENT), "utf8");
};

/**
 * 振込名義で取引先を検索する
 *
 * 完全一致を優先し、確定ルール（isPromoted=true）を最優先で返す。
 */
const lookupByPayerName = (payerName: string, entries: KnowledgeEntry[]): KnowledgeEntry | null => {
  const normalized = normalizePayerName(payerName);

  const promoted = entries.find(
    (el) => el.isPromoted && normalizePayerName(el.payerNamePattern) === normalized,
  );
  if (promoted) {
    return promoted;
  }

  const match = entries.find((el) => normalizePayerName(el.payerNamePattern) === normalized);
  return match ?? null;
};

/** 消込結果から辞書エントリを追加/更新する */
interface MappingInput {
  payerName: string;
  clientCode: string;
  clientName: string;
}

const getTodayString = (): string => {
  const parts = new Date().toISOString().split("T");
  return parts[DATE_PART_INDEX] ?? "";
};

const recordMapping = (input: MappingInput, entries: KnowledgeEntry[]): KnowledgeEntry[] => {
  const normalized = normalizePayerName(input.payerName);
  const existing = entries.find(
    (el) =>
      normalizePayerName(el.payerNamePattern) === normalized && el.clientCode === input.clientCode,
  );

  if (existing) {
    existing.usageCount += 1;
    existing.lastUsedDate = getTodayString();
  } else {
    entries.push({
      clientCode: input.clientCode,
      clientName: input.clientName,
      isPromoted: false,
      lastUsedDate: getTodayString(),
      payerNamePattern: input.payerName,
      usageCount: 1,
    });
  }

  return entries;
};

export { loadKnowledge, lookupByPayerName, recordMapping, saveKnowledge };
