/**
 * デモ用データローダー
 * Node.jsモジュールを使用するI/O処理をデモ本体から分離する。
 */

/* eslint-disable import/no-nodejs-modules, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- CLI demo: Node.js types unavailable in Cloudflare-targeted project */
import type { AccountCode, Invoice, ProcessingRecord, VendorPattern } from "../types.js";
import { dirname, resolve } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
/* eslint-enable import/no-nodejs-modules */

// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment -- Node.js API types not available in Cloudflare-targeted project
const __dirname: string = dirname(fileURLToPath(import.meta.url)) as string;

const loadJson = <TData>(filePath: string): TData => {
  const raw = readFileSync(resolve(__dirname, filePath), "utf8");
  return JSON.parse(raw) as TData;
};

const invoices = loadJson<Invoice[]>("../data/sample-invoices.json");
const accountData = loadJson<{ accounts: AccountCode[] }>("../data/account-master.json");

const INITIAL_PATTERNS: VendorPattern[] = [
  {
    accountCode: "6100",
    accountName: "消耗品費",
    frequency: 12,
    itemKeyword: "コピー用紙",
    lastUsed: "2026-03-15",
    source: "initial",
    vendor: "株式会社オフィスサプライ",
  },
  {
    accountCode: "6200",
    accountName: "通信費",
    frequency: 8,
    itemKeyword: "AWS",
    lastUsed: "2026-03-20",
    source: "initial",
    vendor: "クラウドテック株式会社",
  },
];

const createRecords = (): ProcessingRecord[] =>
  invoices.map((invoice) => ({
    approvedAt: null,
    classification: null,
    correctedAccountCode: null,
    correctedAccountName: null,
    invoice,
    processedAt: null,
    status: "pending" as const,
    validation: null,
  }));

const saveKnowledgeState = (data: string): string => {
  const outputPath = resolve(__dirname, "../data/knowledge-state.json");
  writeFileSync(outputPath, data, "utf8");
  return outputPath;
};

export { accountData, createRecords, INITIAL_PATTERNS, invoices, saveKnowledgeState };
