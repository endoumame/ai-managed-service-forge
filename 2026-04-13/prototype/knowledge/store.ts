/**
 * ナレッジストア — JSONファイルベースの知識永続化
 *
 * なぜJSONファイルか:
 * プロトタイプ段階ではDBは不要。ファイルベースにすることで
 * ナレッジの中身を人間が直接確認・編集でき、透明性が高い。
 * 本番ではPostgreSQL等に置き換える想定。
 */

/* eslint-disable no-magic-numbers, import/no-nodejs-modules, sort-imports, typescript-eslint/no-unsafe-type-assertion */
import type { ImprovementProposal, VendorPattern } from "../types/index.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, "..", "data");
const JSON_INDENT = 2;

const ensureDataDir = (): void => {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
};

const loadJSON = <TData>(filename: string, defaultValue: TData): TData => {
  const filepath = join(DATA_DIR, filename);
  if (!existsSync(filepath)) {
    return defaultValue;
  }
  return JSON.parse(readFileSync(filepath, "utf8")) as TData;
};

const saveJSON = <TData>(filename: string, data: TData): void => {
  ensureDataDir();
  const filepath = join(DATA_DIR, filename);
  writeFileSync(filepath, JSON.stringify(data, null, JSON_INDENT), "utf8");
};

// ── 取引先パターン ──

const getVendorPatterns = (): Record<string, VendorPattern> => loadJSON("vendor-patterns.json", {});

const getVendorPattern = (vendor: string): VendorPattern | undefined => {
  const patterns = getVendorPatterns();
  return patterns[vendor];
};

/**
 * 取引先パターンを更新する
 * 仕訳確定時に呼び出し、科目の使用頻度を記録
 */
const updateVendorPattern = (vendor: string, accountCodes: string[]): void => {
  const patterns = getVendorPatterns();
  const existing = patterns[vendor] ?? {
    accountFrequency: {},
    lastUsedAccounts: [],
    processedCount: 0,
    vendor,
  };

  for (const code of accountCodes) {
    existing.accountFrequency[code] = (existing.accountFrequency[code] ?? 0) + 1;
  }
  existing.lastUsedAccounts = accountCodes;
  existing.processedCount += 1;

  patterns[vendor] = existing;
  saveJSON("vendor-patterns.json", patterns);
};

// ── 改善提案 ──

const getProposals = (): ImprovementProposal[] => loadJSON("proposals.json", []);

const addProposal = (proposal: ImprovementProposal): void => {
  const proposals = getProposals();
  proposals.push(proposal);
  saveJSON("proposals.json", proposals);
};

const updateProposalStatus = (id: string, status: "approved" | "rejected"): void => {
  const proposals = getProposals();
  const target = proposals.find((proposal) => proposal.id === id);
  if (target) {
    target.status = status;
    saveJSON("proposals.json", proposals);
  }
};

// ── 修正履歴（自己改善ループの入力データ） ──

interface CorrectionRecord {
  vendor: string;
  originalAccountCode: string;
  correctedAccountCode: string;
  correctedAccountName: string;
  description: string;
  timestamp: string;
}

const getCorrectionHistory = (): CorrectionRecord[] => loadJSON("correction-history.json", []);

const addCorrectionRecord = (record: CorrectionRecord): void => {
  const history = getCorrectionHistory();
  history.push(record);
  saveJSON("correction-history.json", history);
};

export {
  addCorrectionRecord,
  addProposal,
  getCorrectionHistory,
  getProposals,
  getVendorPattern,
  getVendorPatterns,
  updateProposalStatus,
  updateVendorPattern,
};
export type { CorrectionRecord };
