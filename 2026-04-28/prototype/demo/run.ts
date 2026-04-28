/* oxlint-disable import/no-nodejs-modules, typescript-eslint/no-unsafe-assignment, typescript-eslint/no-unsafe-call, typescript-eslint/no-unsafe-argument, typescript-eslint/no-unsafe-type-assertion, typescript-eslint/no-unsafe-member-access */
import type {
  AccountMaster,
  CorrectionRecord,
  ExtractionResult,
  JournalEntry,
  VendorMapping,
} from "../types.ts";
import {
  buildContext,
  createProcessingChecklist,
  enrichContextWithExtraction,
  enrichContextWithJournal,
  executeHooks,
  registerDefaultHooks,
  runAllChecks,
  runChecklist,
} from "../harness/index.ts";
import { dirname, join } from "node:path";
import { getSnapshot, initStore } from "../knowledge/store.ts";
import { readFileSync, writeFileSync } from "node:fs";
import {
  sampleInvoiceHighAmount,
  sampleInvoiceKnownVendor,
  sampleInvoiceNewVendor,
} from "./sample-data.ts";
import type { StoreData } from "../knowledge/store.ts";
import { createJournalEntry } from "../deterministic/rules.ts";
import { extractAndClassify } from "../agent/index.ts";
import { fileURLToPath } from "node:url";
import { recordCorrectionAndAnalyze } from "../knowledge/improver.ts";

const JSON_INDENT = 2;
const PERCENTAGE = 100;
const SEPARATOR_WIDTH = 60;
const ZERO = 0;

const currentDir = dirname(fileURLToPath(import.meta.url));
const dataDir = join(currentDir, "..", "data");

const log = (message: string): void => {
  process.stdout.write(`${message}\n`);
};

const separator = (): void => {
  log("━".repeat(SEPARATOR_WIDTH));
};

const heading = (title: string): void => {
  separator();
  log(`  ${title}`);
  separator();
};

const loadStoreFromFiles = (): StoreData => {
  const readJson = <TData>(file: string): TData =>
    JSON.parse(readFileSync(join(dataDir, file), "utf8")) as TData;

  return {
    accounts: readJson<AccountMaster[]>("accounts.json"),
    corrections: readJson<CorrectionRecord[]>("corrections.json"),
    improvements: [],
    vendors: readJson<VendorMapping[]>("vendors.json"),
  };
};

const saveStoreToFiles = (): void => {
  const snapshot = getSnapshot();
  const writeJson = <TData>(file: string, data: TData): void => {
    writeFileSync(join(dataDir, file), `${JSON.stringify(data, null, JSON_INDENT)}\n`);
  };
  writeJson("vendors.json", snapshot.vendors);
  writeJson("corrections.json", snapshot.corrections);
  writeJson("improvements.json", snapshot.improvements);
};

const logMessages = (messages: string[], prefix: string): void => {
  for (const msg of messages) {
    log(`  ${prefix}${msg}`);
  }
};

const printInvoiceHeader = (result: ExtractionResult): void => {
  log(`\n  請求書: ${result.invoice.vendorName} (${result.invoice.id})`);
  log(`  日付: ${result.invoice.invoiceDate}`);
  log(
    `  合計: ${String(result.invoice.totalAmount)}円 (税: ${String(result.invoice.taxAmount)}円)`,
  );
};

const printExtractionResult = (result: ExtractionResult): void => {
  printInvoiceHeader(result);
  log("\n  --- 抽出された明細 ---");
  for (const line of result.extractedLines) {
    const pct = String(Math.round(line.confidence * PERCENTAGE));
    log(
      `  ${line.description}: ${line.suggestedAccountName}(${line.suggestedAccountCode}) 信頼度:${pct}%`,
    );
  }
  if (result.anomalies.length > ZERO) {
    log("\n  --- 異常検知 ---");
    for (const anomaly of result.anomalies) {
      log(`  [${anomaly.severity}] ${anomaly.message}`);
    }
  }
};

const printJournalEntry = (entry: JournalEntry): void => {
  log("\n  --- 仕訳 ---");
  log(`  状態: ${entry.status} | 信頼度: ${String(Math.round(entry.confidence * PERCENTAGE))}%`);
  for (const line of entry.lines) {
    const dr = line.debit > ZERO ? `借方 ${String(line.debit)}円` : "";
    const cr = line.credit > ZERO ? `貸方 ${String(line.credit)}円` : "";
    log(`  ${line.accountName}(${line.accountCode}): ${dr}${cr} - ${line.description}`);
  }
  log(`  合計: 借方=${String(entry.totalDebit)}円 / 貸方=${String(entry.totalCredit)}円`);
  if (entry.reviewReasons.length > ZERO) {
    log("\n  --- ヒューマンレビュー理由 ---");
    logMessages(entry.reviewReasons, "- ");
  }
};

const runExtraction = (invoice: typeof sampleInvoiceKnownVendor): ExtractionResult => {
  const ctx = buildContext(invoice);
  logMessages(executeHooks("before:extract", ctx).messages, "[hook] ");

  const extraction = extractAndClassify(invoice);
  printExtractionResult(extraction);

  const ctxWithExtraction = enrichContextWithExtraction(ctx, extraction);
  logMessages(executeHooks("after:extract", ctxWithExtraction).messages, "[hook] ");
  return extraction;
};

const processInvoice = (invoice: typeof sampleInvoiceKnownVendor): JournalEntry => {
  heading(`請求書処理: ${invoice.vendorName}`);
  const extraction = runExtraction(invoice);

  const journal = createJournalEntry(extraction);
  printJournalEntry(journal);

  const ctx = enrichContextWithJournal(
    enrichContextWithExtraction(buildContext(invoice), extraction),
    journal,
  );
  logMessages(executeHooks("after:journalize", ctx).messages, "[hook] ");

  return journal;
};

const runChecklistDemo = (extraction: ExtractionResult, journal: JournalEntry): void => {
  heading("終了条件チェックリスト（ハーネス管理）");
  const checklist = createProcessingChecklist(
    () => extraction,
    () => journal,
  );
  const { allPassed, results } = runChecklist(checklist);
  logMessages(results, "");
  log(`\n  全条件通過: ${allPassed ? "YES" : "NO"}`);
};

const runQualityChecksDemo = (extraction: ExtractionResult, journal: JournalEntry): void => {
  heading("品質チェック（決定論的検証）");
  const { allPassed, allMessages } = runAllChecks(extraction, journal);
  logMessages(allMessages, "");
  log(`\n  全チェック通過: ${allPassed ? "YES" : "NO"}`);
};

const buildCorrection = (invoiceId: string, timestamp: string): CorrectionRecord => ({
  correctedAccountCode: "5200",
  correctedAccountName: "外注費",
  invoiceId,
  originalAccountCode: "6000",
  timestamp,
  vendorName: "クラウドテック株式会社",
});

const applyAndLogCorrection = (
  correction: CorrectionRecord,
  label: string,
): ReturnType<typeof recordCorrectionAndAnalyze> => {
  log(
    `  ${label}: ${correction.vendorName} ${correction.originalAccountCode} -> ${correction.correctedAccountCode}`,
  );
  return recordCorrectionAndAnalyze(correction);
};

const printProposals = (proposals: ReturnType<typeof recordCorrectionAndAnalyze>): void => {
  if (proposals.length > ZERO) {
    log("\n  --- 改善提案（ヒューマン・イン・ザ・ループ） ---");
    for (const proposal of proposals) {
      log(`  [${proposal.status}] ${proposal.description}`);
      log("  -> 承認が必要です（自動適用されません）");
    }
  }
};

const runImprovementDemo = (): void => {
  heading("ナレッジ自動改善ループ");
  log("\n  シミュレーション: ユーザーが勘定科目を修正");

  const correction1 = buildCorrection("INV-2026-002", "2026-04-28T10:00:00Z");
  const correction2 = buildCorrection("INV-2026-002b", "2026-04-28T14:00:00Z");

  applyAndLogCorrection(correction1, "修正1");
  const proposals = applyAndLogCorrection(correction2, "修正2");
  printProposals(proposals);
};

const runPhase1KnownVendor = (): void => {
  const extraction1 = extractAndClassify(sampleInvoiceKnownVendor);
  const journal1 = processInvoice(sampleInvoiceKnownVendor);
  runChecklistDemo(extraction1, journal1);
  runQualityChecksDemo(extraction1, journal1);
};

const runPhase2OtherInvoices = (): void => {
  processInvoice(sampleInvoiceNewVendor);
  processInvoice(sampleInvoiceHighAmount);
};

const setup = (): void => {
  log("\n");
  heading("InvoiceForge - AI請求書仕訳オートパイロット プロトタイプ");
  log("  ハーネス制御下でAIが情報抽出・分類し、決定論的コードが検証する\n");
  initStore(loadStoreFromFiles());
  registerDefaultHooks();
};

const main = (): void => {
  setup();
  runPhase1KnownVendor();
  runPhase2OtherInvoices();
  runImprovementDemo();
  saveStoreToFiles();
  heading("デモ完了");
  log("  全請求書の処理が完了しました。");
  log("  data/ ディレクトリにナレッジ更新が保存されています。\n");
};

main();
