// デモエントリポイント: InvoiceForge プロトタイプ
// 請求書処理パイプライン全体をハーネスが制御する様子を実演する

import type {
  ExtractedInvoice,
  JournalEntry,
  KnowledgeFeedback,
  PurchaseOrder,
  RawInvoice,
} from "../types.ts";
import { INVOICES, PURCHASE_ORDERS } from "./sample-data.ts";
import { addFeedback, addJournalPattern, createStore, serialize } from "../knowledge/store.ts";
import { checkJournalBalance, runAllQualityChecks } from "../harness/checker.ts";
import { generateJournalEntry, matchInvoiceToPO } from "../deterministic/rules.ts";
import {
  runAfterExtract,
  runAfterJournalEntry,
  runAfterMatch,
  runBeforeExtract,
} from "../harness/lifecycle.ts";
import { CompletionPlanner } from "../harness/planner.ts";
import { extractInvoiceData } from "../agent/index.ts";
import { generateAllProposals } from "../knowledge/improver.ts";
import { log } from "../logger.ts";

const SEPARATOR_LENGTH = 60;
const FIRST_INDEX = 0;

const printSeparator = (): void => {
  log(`\n${"=".repeat(SEPARATOR_LENGTH)}`);
};

const extractAndValidate = (
  invoice: RawInvoice,
  processedInvoices: ExtractedInvoice[],
): ExtractedInvoice | null => {
  const extracted = extractInvoiceData(invoice);
  log(`  抽出結果: ${extracted.vendor} / ${extracted.totalAmount}円`);
  runAfterExtract(extracted);
  runAllQualityChecks(extracted, processedInvoices);
  processedInvoices.push(extracted);
  return extracted;
};

const matchAndGenerateEntry = (
  extracted: ExtractedInvoice,
  purchaseOrders: PurchaseOrder[],
): JournalEntry => {
  const matchResult = matchInvoiceToPO(extracted, purchaseOrders);
  runAfterMatch(matchResult);
  const entry = generateJournalEntry(extracted, matchResult, purchaseOrders);
  runAfterJournalEntry(entry);
  checkJournalBalance(entry);
  log(`\n  仕訳: ${entry.debit.accountName}(${entry.debit.accountCode}) ${entry.debit.amount}円`);
  log(`  ステータス: ${entry.status}`);
  return entry;
};

const processInvoice = (
  invoice: RawInvoice,
  purchaseOrders: PurchaseOrder[],
  processedInvoices: ExtractedInvoice[],
): JournalEntry | null => {
  printSeparator();
  log(`\n  請求書処理開始: ${invoice.invoiceId}`);

  const beforeResult = runBeforeExtract({ rawText: invoice.rawText });
  if (!beforeResult.passed) {
    log(`  x 前処理チェック失敗。スキップします。`);
    return null;
  }

  const extracted = extractAndValidate(invoice, processedInvoices);
  if (extracted === null) {
    return null;
  }
  return matchAndGenerateEntry(extracted, purchaseOrders);
};

const createFeedbackEntry = (entry: JournalEntry, suffix: string): KnowledgeFeedback => ({
  correctedAt: new Date().toISOString(),
  correctedBy: "経理太郎",
  correctedValue: entry.debit.accountCode,
  field: "accountCode",
  invoiceId: `${entry.invoiceId}${suffix}`,
  originalValue: "6900",
});

const simulateFeedback = (
  knowledgeStore: ReturnType<typeof createStore>,
  entries: JournalEntry[],
): void => {
  printSeparator();
  log("\n  フィードバックシミュレーション（経理担当者の修正を模擬）\n");

  for (const entry of entries) {
    if (entry.status === "pending-review") {
      addFeedback(knowledgeStore, createFeedbackEntry(entry, ""));
      addFeedback(knowledgeStore, createFeedbackEntry(entry, "-prev"));
      addJournalPattern(knowledgeStore, {
        accountCode: entry.debit.accountCode,
        accountName: entry.debit.accountName,
        vendorName: entry.description.split(" - ").at(FIRST_INDEX) ?? entry.description,
      });
    }
  }
};

interface SummaryInput {
  knowledgeStore: ReturnType<typeof createStore>;
  processedCount: number;
  autoApprovedCount: number;
  reviewCount: number;
}

const printSummary = (input: SummaryInput): void => {
  const proposals = generateAllProposals(input.knowledgeStore);
  printSeparator();
  log("\n  処理サマリー\n");
  log(`  処理請求書数: ${input.processedCount}`);
  log(`  自動承認: ${input.autoApprovedCount}件`);
  log(`  要レビュー: ${input.reviewCount}件`);
  log(`  改善提案: ${proposals.length}件`);
  log(`\n  ナレッジストア状態:\n${serialize(input.knowledgeStore)}`);
};

const runInvoiceLoop = (): { processed: ExtractedInvoice[]; entries: JournalEntry[] } => {
  const processed: ExtractedInvoice[] = [];
  const entries: JournalEntry[] = [];

  for (const invoice of INVOICES) {
    const entry = processInvoice(invoice, PURCHASE_ORDERS, processed);
    if (entry !== null) {
      entries.push(entry);
    }
  }
  return { entries, processed };
};

const updatePlannerStatus = (
  planner: CompletionPlanner,
  processedCount: number,
  journalCount: number,
): { reviewCount: number; autoApprovedCount: number } => {
  planner.markComplete("extract-all", `${processedCount}件抽出完了`);
  planner.markComplete("validate-all", `${processedCount}件チェック完了`);
  planner.markComplete("match-all", `${processedCount}件照合完了`);
  planner.markComplete("journal-all", `${journalCount}件仕訳生成完了`);
  return { autoApprovedCount: 0, reviewCount: 0 };
};

const processAllInvoices = (
  planner: CompletionPlanner,
  knowledgeStore: ReturnType<typeof createStore>,
): void => {
  const { entries, processed } = runInvoiceLoop();
  updatePlannerStatus(planner, processed.length, entries.length);

  const reviewCount = entries.filter((je) => je.status === "pending-review").length;
  const autoApprovedCount = entries.filter((je) => je.status === "auto-approved").length;
  planner.markComplete(
    "review-flagged",
    `要レビュー: ${reviewCount}件, 自動承認: ${autoApprovedCount}件`,
  );

  simulateFeedback(knowledgeStore, entries);
  printSummary({
    autoApprovedCount,
    knowledgeStore,
    processedCount: processed.length,
    reviewCount,
  });
};

const printHeader = (): void => {
  log("===========================================================");
  log("  InvoiceForge - AI請求書マッチング＆仕訳エンジン デモ");
  log("===========================================================");
  log(`\n  処理対象: ${INVOICES.length}件の請求書, ${PURCHASE_ORDERS.length}件の発注書\n`);
};

const main = (): void => {
  printHeader();
  const planner = new CompletionPlanner(INVOICES.length);
  const knowledgeStore = createStore();

  planner.printStatus();
  processAllInvoices(planner, knowledgeStore);
  planner.markComplete("summary-generated", "サマリー出力完了");
  planner.printStatus();

  if (planner.isComplete()) {
    log("  全チェックリスト完了。処理を終了します。\n");
  }
};

main();
