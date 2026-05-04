import type { InvoiceInput, PipelineContext } from "../types.ts";
import { afterClassifyHook, afterExtractHook, beforeCommitHook } from "../harness/checker.ts";
import { approveRule, createEmptyStore } from "../knowledge/store.ts";
import { extractInvoiceData, generateJournalCandidate } from "../agent/index.ts";
import {
  getPendingProposals,
  learnFromApproval,
  proposeRuleFromCorrection,
} from "../knowledge/improver.ts";
import { CompletionPlanner } from "../harness/planner.ts";
import { LifecycleManager } from "../harness/lifecycle.ts";
import { logger } from "../logger.ts";
import { sampleInvoices } from "./sample-invoices.ts";

const EMPTY = 0;

const setupLifecycle = (): LifecycleManager => {
  const lifecycle = new LifecycleManager();
  lifecycle.registerHook("afterExtract", afterExtractHook);
  lifecycle.registerHook("afterClassify", afterClassifyHook);
  lifecycle.registerHook("beforeCommit", beforeCommitHook);
  return lifecycle;
};

const setupPlanner = (): CompletionPlanner => {
  const planner = new CompletionPlanner();
  planner.addCondition(
    "extracted",
    "全必須フィールドが抽出済み",
    (ctx) => ctx.extractedData !== null,
  );
  planner.addCondition("classified", "仕訳候補が生成済み", (ctx) => ctx.journalCandidate !== null);
  planner.addCondition(
    "no-errors",
    "バリデーションエラーなし",
    (ctx) => ctx.validationErrors.length === EMPTY,
  );
  return planner;
};

const createInitialContext = (
  invoice: InvoiceInput,
  knowledge: PipelineContext["knowledge"],
): PipelineContext => ({
  extractedData: null,
  invoice,
  journalCandidate: null,
  knowledge,
  validationErrors: [],
  warnings: [],
});

interface PipelineDeps {
  lifecycle: LifecycleManager;
  planner: CompletionPlanner;
  knowledge: PipelineContext["knowledge"];
}

const hasErrors = (ctx: PipelineContext): boolean => ctx.validationErrors.length > EMPTY;

const runExtraction = async (
  ctx: PipelineContext,
  deps: PipelineDeps,
): Promise<PipelineContext> => {
  const phased = await deps.lifecycle.executePhase("beforeExtract", ctx);
  const extracted = extractInvoiceData(ctx.invoice, deps.knowledge);
  const updated = { ...phased, extractedData: extracted };
  return deps.lifecycle.executePhase("afterExtract", updated);
};

const runClassification = async (
  ctx: PipelineContext,
  deps: PipelineDeps,
): Promise<PipelineContext> => {
  const phased = await deps.lifecycle.executePhase("beforeClassify", ctx);
  if (ctx.extractedData === null) {
    return phased;
  }
  const candidate = generateJournalCandidate(
    ctx.invoice.invoiceId,
    ctx.extractedData,
    deps.knowledge,
  );
  const updated = { ...phased, journalCandidate: candidate };
  return deps.lifecycle.executePhase("afterClassify", updated);
};

const runCommitCheck = async (
  ctx: PipelineContext,
  deps: PipelineDeps,
): Promise<PipelineContext> => {
  const committed = await deps.lifecycle.executePhase("beforeCommit", ctx);
  deps.planner.evaluate(committed);
  deps.planner.report();
  return committed;
};

const processInvoice = async (
  invoice: InvoiceInput,
  deps: PipelineDeps,
): Promise<PipelineContext> => {
  logger.step(`請求書処理開始: ${invoice.invoiceId} (${invoice.vendorName})`);
  const ctx = await runExtraction(createInitialContext(invoice, deps.knowledge), deps);
  if (hasErrors(ctx)) {
    return ctx;
  }

  const classified = await runClassification(ctx, deps);
  if (hasErrors(classified)) {
    return classified;
  }

  return runCommitCheck(classified, deps);
};

const printReviewReasons = (reasons: string[]): void => {
  if (reasons.length === EMPTY) {
    return;
  }
  logger.step("レビュー理由:");
  for (const reason of reasons) {
    logger.info(`  - ${reason}`);
  }
};

const printJournalEntries = (ctx: PipelineContext): void => {
  if (ctx.journalCandidate === null) {
    return;
  }
  const candidate = ctx.journalCandidate;
  logger.step("仕訳候補:");
  logger.info(`  信頼度: ${candidate.confidenceScore}`);
  logger.info(`  レビュー要否: ${candidate.needsHumanReview ? "要" : "不要"}`);

  for (const entry of candidate.entries) {
    logger.info(
      `  ${entry.date} | 借方: ${entry.debitAccount} ${entry.debitAmount}円 | 貸方: ${entry.creditAccount} ${entry.creditAmount}円`,
    );
  }
  printReviewReasons(candidate.reviewReasons);
};

const demonstrateKnowledgeLoop = (
  knowledge: PipelineContext["knowledge"],
): PipelineContext["knowledge"] => {
  logger.step("=== ナレッジ自動改善ループのデモ ===");

  let store = proposeRuleFromCorrection(knowledge, {
    correctedAccount: "5210",
    correctedAccountName: "通信費",
    itemDescription: "サーバ利用料",
    vendorName: "クラウドテック",
  });

  const proposals = getPendingProposals(store);
  logger.info(`提案中のルール: ${proposals.length} 件`);

  for (const proposal of proposals) {
    logger.info(
      `  [提案] ${proposal.vendorPattern} × ${proposal.itemPattern} → ${proposal.accountName}`,
    );
    logger.info("  → 経理担当者が承認（ヒューマン・イン・ザ・ループ）");
    store = approveRule(store, proposal.id);
  }

  return store;
};

const SEPARATOR_LENGTH = 50;
const STEP = 1;

interface InvoiceQueueState {
  invoices: InvoiceInput[];
  index: number;
  knowledge: PipelineContext["knowledge"];
}

const processNextInvoice = async (
  state: InvoiceQueueState,
  deps: PipelineDeps,
): Promise<PipelineContext["knowledge"]> => {
  if (state.index >= state.invoices.length) {
    return state.knowledge;
  }
  const invoice = state.invoices[state.index];
  const ctx = await processInvoice(invoice, { ...deps, knowledge: state.knowledge });
  printJournalEntries(ctx);
  const updated =
    ctx.journalCandidate === null
      ? state.knowledge
      : learnFromApproval(state.knowledge, ctx.journalCandidate);
  logger.step("─".repeat(SEPARATOR_LENGTH));
  return processNextInvoice({ ...state, index: state.index + STEP, knowledge: updated }, deps);
};

logger.step("=== InvoiceForge プロトタイプ デモ ===");
const knowledge = demonstrateKnowledgeLoop(createEmptyStore());
const deps: PipelineDeps = { knowledge, lifecycle: setupLifecycle(), planner: setupPlanner() };
const finalKnowledge = await processNextInvoice(
  { index: 0, invoices: sampleInvoices, knowledge },
  deps,
);
logger.step("=== デモ完了 ===");
logger.info(`最終ナレッジ: ${finalKnowledge.rules.length} ルール登録済み`);
