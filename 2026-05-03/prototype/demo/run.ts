// InvoiceGuard デモエントリポイント
// 全レイヤー（ハーネス・AIエージェント・決定論的コード・ナレッジ）を統合して実行

import type { ExtractedData, InvoiceChecklist, RawInvoice } from "../types.ts";
import { applyHookToChecklist, createHooks } from "../harness/lifecycle.ts";
import {
  buildCorrectionFromExtracted,
  createEngine,
  formatProposal,
  generateProposals,
  recordCorrection,
} from "../knowledge/improver.ts";
import {
  buildJournalFromExtracted,
  detectDuplicates,
  determineApprovalRoute,
} from "../deterministic/rules.ts";
import { createChecklist, formatChecklist, hasFailed, isComplete } from "../harness/planner.ts";
import { createInitialKnowledge, createStore, findByVendor } from "../knowledge/store.ts";
import type { CheckContext } from "../harness/checker.ts";
import type { KnowledgeStore } from "../knowledge/store.ts";
import type { LifecycleHooks } from "../harness/lifecycle.ts";
import { extractInvoiceData } from "../agent/index.ts";
import { runQualityChecks } from "../harness/checker.ts";

const SEPARATOR_LENGTH = 60;
const THIN_SEPARATOR_LENGTH = 40;
const SEPARATOR = "=".repeat(SEPARATOR_LENGTH);
const THIN_SEPARATOR = "-".repeat(THIN_SEPARATOR_LENGTH);
const ZERO = 0;
const ONE = 1;

const log = (message: string): void => {
  // eslint-disable-next-line no-console
  console.log(message);
};

const isRawInvoiceArray = (value: unknown): value is RawInvoice[] =>
  Array.isArray(value) &&
  value.every(
    (item) => typeof item === "object" && item !== null && "id" in item && "vendor" in item,
  );

const loadSampleInvoices = async (): Promise<RawInvoice[]> => {
  const module = await import("../data/sample-invoices.json", { with: { type: "json" } });
  const data: unknown = module.default;
  if (!isRawInvoiceArray(data)) {
    throw new TypeError("サンプルデータの読み込みに失敗しました");
  }
  return data;
};

interface PhaseResult {
  extracted: ExtractedData;
  checklist: InvoiceChecklist;
}

interface ProcessingContext {
  invoice: RawInvoice;
  store: KnowledgeStore;
  hooks: LifecycleHooks;
}

const runExtractionPhase = async (
  ctx: ProcessingContext,
  checklist: InvoiceChecklist,
): Promise<{ extracted: ExtractedData; checklist: InvoiceChecklist }> => {
  const preCheck = ctx.hooks.beforeExtraction(ctx.invoice);
  let updated = applyHookToChecklist(checklist, preCheck, "extraction");
  log(`  [Hook] beforeExtraction: ${preCheck.message}`);

  const knowledge = findByVendor(ctx.store, ctx.invoice.vendor);
  const { data: extracted, usedMock } = await extractInvoiceData({
    invoice: ctx.invoice,
    knowledge,
    useMock: true,
  });
  log(
    `  [Agent] データ抽出完了 (mock=${String(usedMock)}, confidence=${String(extracted.confidence)})`,
  );

  const postExtraction = ctx.hooks.afterExtraction(extracted);
  updated = applyHookToChecklist(updated, postExtraction, "extraction_quality");
  log(`  [Hook] afterExtraction: ${postExtraction.message}`);
  return { checklist: updated, extracted };
};

const applyQualityChecks = (
  quality: ReturnType<typeof runQualityChecks>,
  checklist: InvoiceChecklist,
): InvoiceChecklist => {
  const balancePassed = quality.checks[ZERO]?.status === "passed";
  let updated = applyHookToChecklist(
    checklist,
    { message: quality.checks[ZERO]?.message ?? "", passed: balancePassed },
    "journal_balanced",
  );
  const reconPassed = quality.checks[ONE]?.status === "passed";
  updated = applyHookToChecklist(
    updated,
    { message: quality.checks[ONE]?.message ?? "", passed: reconPassed },
    "amount_reconciled",
  );
  return updated;
};

const logHumanReviewReasons = (quality: ReturnType<typeof runQualityChecks>): void => {
  if (quality.requiresHumanReview) {
    log("  [!] ヒューマンレビュー必要:");
    for (const reason of quality.humanReviewReasons) {
      log(`      - ${reason}`);
    }
  }
};

const runQualityPhase = (
  ctx: ProcessingContext,
  extracted: ExtractedData,
  checklist: InvoiceChecklist,
): InvoiceChecklist => {
  const journal = buildJournalFromExtracted(extracted);
  const postJournal = ctx.hooks.afterJournalEntry(journal);
  const updated = applyHookToChecklist(checklist, postJournal, "journal_generated");
  log(`  [Hook] afterJournalEntry: ${postJournal.message}`);

  const quality = runQualityChecks({
    extracted,
    journal,
    original: ctx.invoice,
  } satisfies CheckContext);
  const finalChecklist = applyQualityChecks(quality, updated);
  logHumanReviewReasons(quality);
  return finalChecklist;
};

const runApprovalPhase = (
  extracted: ExtractedData,
  checklist: InvoiceChecklist,
): InvoiceChecklist => {
  const approval = determineApprovalRoute(extracted);
  const updated = applyHookToChecklist(
    checklist,
    { message: `承認者: ${approval.approver} (${approval.reason})`, passed: true },
    "approval_routed",
  );
  log(`  [Deterministic] 承認ルート: ${approval.approver} (${approval.level})`);
  return updated;
};

const processOneInvoice = async (
  invoice: RawInvoice,
  store: KnowledgeStore,
): Promise<PhaseResult> => {
  const ctx: ProcessingContext = { hooks: createHooks(), invoice, store };
  log(`\n${THIN_SEPARATOR}`);
  log(`処理開始: ${invoice.id} (${invoice.vendor})`);

  const extraction = await runExtractionPhase(ctx, createChecklist(invoice.id));
  const qualityChecklist = runQualityPhase(ctx, extraction.extracted, extraction.checklist);
  const finalChecklist = runApprovalPhase(extraction.extracted, qualityChecklist);

  log(formatChecklist(finalChecklist));
  return { checklist: finalChecklist, extracted: extraction.extracted };
};

const printDuplicateReport = (allExtracted: ExtractedData[]): void => {
  log(`\n${SEPARATOR}`);
  log("重複チェック");
  log(SEPARATOR);
  const duplicates = detectDuplicates(allExtracted);
  if (duplicates.length > ZERO) {
    log(`  [!] 重複検知: ${String(duplicates.length)}件`);
    for (const [left, right] of duplicates) {
      log(`      ${left} <-> ${right}`);
    }
  } else {
    log("  重複なし");
  }
};

const simulateCorrection = (
  allExtracted: ExtractedData[],
  store: KnowledgeStore,
): ReturnType<typeof generateProposals> => {
  const correction = buildCorrectionFromExtracted(allExtracted[ONE], "7000", "賃借料");
  const engine = recordCorrection(createEngine(), correction);
  log(`\n  修正記録: ${allExtracted[ONE].vendorName} の勘定科目を「賃借料」に修正`);
  return generateProposals(engine, store);
};

const printImprovementDemo = (allExtracted: ExtractedData[], store: KnowledgeStore): void => {
  log(`\n${SEPARATOR}`);
  log("ナレッジ改善提案デモ");
  log(SEPARATOR);

  const proposals = simulateCorrection(allExtracted, store);
  log(`\n  改善提案: ${String(proposals.length)}件`);
  for (const proposal of proposals) {
    log(`\n${formatProposal(proposal)}`);
  }
};

interface ProcessedResult {
  extracted: ExtractedData;
  complete: boolean;
  failed: boolean;
}

const printSummary = (results: ProcessedResult[]): void => {
  log(`\n${SEPARATOR}`);
  log("処理サマリ");
  log(SEPARATOR);
  const completed = results.filter((res) => res.complete).length;
  const needsReview = results.filter((res) => !res.complete && !res.failed).length;
  const failed = results.filter((res) => res.failed).length;
  log(
    `  完了: ${String(completed)} / 要レビュー: ${String(needsReview)} / 失敗: ${String(failed)}`,
  );
  log(`  合計: ${String(results.length)}件処理\n`);
};

const toProcessedResult = (result: PhaseResult): ProcessedResult => ({
  complete: isComplete(result.checklist),
  extracted: result.extracted,
  failed: hasFailed(result.checklist),
});

const createInvoiceTask = async (
  invoice: RawInvoice,
  store: KnowledgeStore,
): Promise<PhaseResult> => {
  const result = await processOneInvoice(invoice, store);
  return result;
};

const processAllInvoices = async (
  invoices: RawInvoice[],
  store: KnowledgeStore,
): Promise<ProcessedResult[]> => {
  // eslint-disable-next-line require-await
  const promises = invoices.map(async (inv) => createInvoiceTask(inv, store));
  const phaseResults = await Promise.all(promises);
  return phaseResults.map((result) => toProcessedResult(result));
};

const logHeader = (store: KnowledgeStore, invoiceCount: number): void => {
  log(SEPARATOR);
  log("InvoiceGuard - 請求書処理AIマネージドサービス プロトタイプ");
  log(SEPARATOR);
  log(`\n読み込み請求書数: ${String(invoiceCount)}`);
  log(`ナレッジベース: ${String(store.entries.length)}件の取引先パターン`);
};

const runDemo = async (): Promise<void> => {
  const invoices = await loadSampleInvoices();
  const store = createStore(createInitialKnowledge());
  logHeader(store, invoices.length);

  const results = await processAllInvoices(invoices, store);
  const allExtracted = results.map((res) => res.extracted);

  printDuplicateReport(allExtracted);
  printImprovementDemo(allExtracted, store);
  printSummary(results);
};

await runDemo();
