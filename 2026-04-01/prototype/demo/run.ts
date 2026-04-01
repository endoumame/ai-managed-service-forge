/**
 * InvoiceForge デモ実行エントリポイント
 *
 * なぜこの実装か:
 * プロトタイプの全レイヤー（ハーネス・AIエージェント・決定論的コード・ナレッジ）を
 * 統合して動作させるデモ。処理ロジックはprocess.tsに分離している。
 */

/* eslint-disable no-nodejs-modules, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument -- demo file uses Node.js APIs extensively */
import { CSV_HEADER, journalToCSVRow } from "../deterministic/rules.ts";
import type { InvoiceData, JournalEntry } from "../deterministic/rules.ts";
import {
  createEmptyKnowledge,
  loadKnowledgeFromJSON,
  serializeKnowledge,
} from "../knowledge/store.ts";
import { dirname, join } from "node:path";
import { formatProposals, generateProposals } from "../knowledge/improver.ts";
import { log, processOneInvoice } from "./process.ts";
import { readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const metaUrl: string = import.meta.url;
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call -- Node.js path utils
const currentDir: string = dirname(fileURLToPath(metaUrl));
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call -- Node.js path utils
const DATA_DIR: string = join(currentDir, "..", "data");
const SEPARATOR_LENGTH = 50;

const logSection = (title: string): void => {
  log(`\n${"=".repeat(SEPARATOR_LENGTH)}`);
  log(`  ${title}`);
  log("=".repeat(SEPARATOR_LENGTH));
};

// eslint-disable-next-line require-await -- returns Promise directly
const askUser = async (question: string): Promise<string> => {
  /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- Node.js readline API */
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer: string) => {
      rl.close();
      resolve(answer.trim());
    });
  });
};

/** データ読み込み */
const loadData = (): {
  rawInvoices: Record<string, unknown>[];
  knowledge: ReturnType<typeof createEmptyKnowledge>;
} => {
  const invoicesPath = join(DATA_DIR, "sample-invoices.json");
  const knowledgePath = join(DATA_DIR, "knowledge.json");

  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- JSON parse
  const rawInvoices = JSON.parse(readFileSync(invoicesPath, "utf8")) as Record<string, unknown>[];

  let knowledge = createEmptyKnowledge();
  try {
    knowledge = loadKnowledgeFromJSON(readFileSync(knowledgePath, "utf8"));
    log(
      `Knowledge loaded: ${String(knowledge.patterns.length)} patterns, ${String(knowledge.corrections.length)} corrections`,
    );
  } catch {
    log("No existing knowledge found. Starting fresh.");
  }

  return { knowledge, rawInvoices };
};

/** CSV出力 */
const outputCSV = (entries: JournalEntry[]): void => {
  logSection("Generated Journal Entries (CSV)");
  log(CSV_HEADER);
  for (const entry of entries) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- partial invoice for CSV
    const partial = { invoiceDate: "2026-03-31", vendorName: entry.vendorName } as InvoiceData;
    log(journalToCSVRow(partial, entry));
  }
};

/** 全請求書を順次処理 */
const processAll = async (
  rawInvoices: Record<string, unknown>[],
  knowledge: ReturnType<typeof createEmptyKnowledge>,
): Promise<JournalEntry[]> => {
  const entries: JournalEntry[] = [];
  for (const rawInvoice of rawInvoices) {
    const invoiceId =
      typeof rawInvoice["invoiceId"] === "string" ? rawInvoice["invoiceId"] : "unknown";
    logSection(`Processing Invoice: ${invoiceId}`);
    // eslint-disable-next-line no-await-in-loop -- sequential processing: each invoice modifies shared knowledge
    const entry = await processOneInvoice({ askFn: askUser, knowledge, rawInvoice });
    if (entry !== null) {
      entries.push(entry);
    }
  }
  return entries;
};

/** 結果出力とナレッジ保存 */
const outputResults = (
  entries: JournalEntry[],
  knowledge: ReturnType<typeof createEmptyKnowledge>,
): void => {
  outputCSV(entries);
  logSection("Knowledge Improvement Proposals");
  log(formatProposals(generateProposals(knowledge)));
  writeFileSync(join(DATA_DIR, "knowledge-updated.json"), serializeKnowledge(knowledge), "utf8");
  log("\nUpdated knowledge saved to data/knowledge-updated.json");
  logSection("Demo Complete");
};

/** メイン処理 */
const main = async (): Promise<void> => {
  logSection("InvoiceForge Prototype Demo");
  log("AI Managed Service: Invoice Auto-Journal Prototype\n");
  const { rawInvoices, knowledge } = loadData();
  const entries = await processAll(rawInvoices, knowledge);
  outputResults(entries, knowledge);
};

try {
  await main();
} catch (error: unknown) {
  log(`Demo failed: ${String(error)}`);
  process.exitCode = 1;
}
