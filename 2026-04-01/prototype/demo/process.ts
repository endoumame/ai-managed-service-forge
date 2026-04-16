/**
 * 請求書処理のコアロジック
 * processOneInvoiceの各ステップを関数に分離してmax-statementsに準拠
 */

import type { InvoiceData, JournalEntry } from "../deterministic/rules.ts";
import { afterClassify, afterExtract, beforeExtract, beforeOutput } from "../harness/lifecycle.ts";
import { assessExtractionQuality, assessJournalQuality } from "../harness/checker.ts";
import {
  buildHistoricalPatterns,
  isKnownVendor,
  recordCorrection,
  upsertPattern,
} from "../knowledge/store.ts";
import { classifyJournalEntry, extractInvoiceData } from "../agent/index.ts";
import {
  completeChecklistItem,
  createProcessingPlan,
  formatProgress,
  isProcessingComplete,
} from "../harness/planner.ts";
import type { HookResult } from "../harness/lifecycle.ts";
import type { KnowledgeData } from "../knowledge/store.ts";
import { validateAmountIntegrity } from "../deterministic/rules.ts";

const PERCENTAGE = 100;

const log = (msg: string): void => {
  // eslint-disable-next-line no-console -- demo output
  console.log(msg);
};

const logHookResult = (hookName: string, result: HookResult): void => {
  const status = result.passed ? "PASS" : "FAIL";
  log(`  [${status}] ${hookName}`);
  for (const err of result.errors) {
    log(`    ERROR: ${err}`);
  }
  for (const warn of result.warnings) {
    log(`    WARN: ${warn}`);
  }
};

type AskFn = (question: string) => Promise<string>;

/** Step 1-2: 入力検証とAI抽出 */
const extractAndValidate = (
  rawInvoice: Record<string, unknown>,
): ReturnType<typeof extractInvoiceData> | null => {
  const inputCheck = beforeExtract(rawInvoice);
  logHookResult("beforeExtract", inputCheck);
  if (!inputCheck.passed) {
    return null;
  }

  const extraction = extractInvoiceData(rawInvoice);
  const extractCheck = afterExtract(extraction.data);
  logHookResult("afterExtract", extractCheck);

  return extractCheck.passed ? extraction : null;
};

/** 分類結果のログ出力 */
const logClassification = (classification: ReturnType<typeof classifyJournalEntry>): void => {
  log(`  Reasoning: ${classification.reasoning}`);
  log(`  Account: ${classification.entry.accountCode} (${classification.entry.accountName})`);
  log(`  Confidence: ${String(Math.round(classification.entry.confidence * PERCENTAGE))}%`);
};

/** Step 3-4: 分類と金額検証 */
const classifyAndVerify = (
  invoiceData: InvoiceData,
  knowledge: KnowledgeData,
): ReturnType<typeof classifyJournalEntry> | null => {
  const classification = classifyJournalEntry(invoiceData, knowledge);
  logClassification(classification);

  const historicalPatterns = buildHistoricalPatterns(knowledge);
  logHookResult("afterClassify", afterClassify(classification.entry, historicalPatterns));

  const outputCheck = beforeOutput(invoiceData);
  logHookResult("beforeOutput", outputCheck);
  if (!outputCheck.passed) {
    return null;
  }

  log(
    `  Amount Integrity: ${validateAmountIntegrity(invoiceData.subtotalAmount, invoiceData.taxAmount, invoiceData.totalAmount) ? "PASS" : "FAIL"}`,
  );

  return classification;
};

interface ReviewContext {
  invoiceData: InvoiceData;
  classification: ReturnType<typeof classifyJournalEntry>;
  knowledge: KnowledgeData;
  askFn: AskFn;
}

/** 科目コードの修正を適用 */
const applyCodeChange = (ctx: ReviewContext, newCode: string): void => {
  recordCorrection(ctx.knowledge, {
    correctedCode: newCode,
    description: ctx.classification.entry.description,
    originalCode: ctx.classification.entry.accountCode,
    reason: "User correction",
    vendorName: ctx.invoiceData.vendorName,
  });
  ctx.classification.entry.accountCode = newCode;
  log(`  -> Account code changed to: ${newCode}`);
};

/** ユーザー入力に基づく修正処理 */
const applyUserCorrection = async (ctx: ReviewContext): Promise<boolean> => {
  const answer = await ctx.askFn(
    `\n  Accept journal entry? [Y]es / [N]o / [C]hange account code: `,
  );

  if (answer.toLowerCase() === "n") {
    log("  -> Rejected by user.");
    return false;
  }
  if (answer.toLowerCase() === "c") {
    applyCodeChange(ctx, await ctx.askFn("  Enter new account code: "));
  }
  return true;
};

/** Step 5: 人間承認フロー */
const handleHumanReview = async (ctx: ReviewContext): Promise<boolean> => {
  const journalQuality = assessJournalQuality(
    ctx.invoiceData,
    ctx.classification.entry,
    !isKnownVendor(ctx.knowledge, ctx.invoiceData.vendorName),
  );

  if (!journalQuality.requiresHumanReview) {
    return true;
  }

  log("\n--- Human Review Required ---");
  for (const reason of journalQuality.humanReviewReasons) {
    log(`  Reason: ${reason}`);
  }

  const result = await applyUserCorrection(ctx);
  return result;
};

interface FinalizeContext {
  plan: ReturnType<typeof createProcessingPlan>;
  knowledge: KnowledgeData;
  entry: JournalEntry;
  vendorName: string;
}

/** ナレッジにパターンを記録し進捗を表示 */
const finalizeProcessing = (ctx: FinalizeContext): void => {
  const { plan, knowledge, entry, vendorName } = ctx;
  completeChecklistItem(plan, "human_review_completed");
  completeChecklistItem(plan, "output_validated");
  upsertPattern(knowledge, {
    accountCode: entry.accountCode,
    accountName: entry.accountName,
    approvedByHuman: true,
    description: entry.description,
    vendorName,
  });
  log(`\n${formatProgress(plan)}`);
  log(`  Processing Complete: ${String(isProcessingComplete(plan))}`);
};

interface ProcessContext {
  rawInvoice: Record<string, unknown>;
  knowledge: KnowledgeData;
  askFn: AskFn;
}

/** チェックリストの複数項目を一括完了 */
const completeItems = (plan: ReturnType<typeof createProcessingPlan>, ...ids: string[]): void => {
  for (const id of ids) {
    completeChecklistItem(plan, id);
  }
};

const getInvoiceId = (raw: Record<string, unknown>): string =>
  typeof raw["invoiceId"] === "string" ? raw["invoiceId"] : "unknown";

/** Phase 1: 抽出と品質チェック */
const phaseExtract = (
  ctx: ProcessContext,
): { invoiceData: InvoiceData; plan: ReturnType<typeof createProcessingPlan> } | null => {
  const plan = createProcessingPlan(getInvoiceId(ctx.rawInvoice));
  const extraction = extractAndValidate(ctx.rawInvoice);
  if (extraction === null) {
    return null;
  }
  completeItems(plan, "input_validated", "fields_extracted");
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- validated by afterExtract
  const invoiceData = extraction.data as InvoiceData;
  const qs = assessExtractionQuality(invoiceData, extraction.confidenceScores);
  log(`  Extraction Quality Score: ${String(qs.overallScore)}/100`);
  completeChecklistItem(plan, "extraction_quality_passed", `score=${String(qs.overallScore)}`);
  return { invoiceData, plan };
};

/** Phase 2: 分類・検証・承認・完了 */
const phaseClassifyAndFinalize = async (
  extracted: { invoiceData: InvoiceData; plan: ReturnType<typeof createProcessingPlan> },
  ctx: ProcessContext,
): Promise<JournalEntry | null> => {
  const { invoiceData, plan } = extracted;
  const classification = classifyAndVerify(invoiceData, ctx.knowledge);
  if (classification === null) {
    return null;
  }
  completeItems(plan, "amount_integrity_passed", "account_classified");

  const reviewCtx: ReviewContext = {
    askFn: ctx.askFn,
    classification,
    invoiceData,
    knowledge: ctx.knowledge,
  };
  if (!(await handleHumanReview(reviewCtx))) {
    return null;
  }

  finalizeProcessing({
    entry: classification.entry,
    knowledge: ctx.knowledge,
    plan,
    vendorName: invoiceData.vendorName,
  });
  return classification.entry;
};

/** 1件の請求書を処理する統合フロー */
const processOneInvoice = async (ctx: ProcessContext): Promise<JournalEntry | null> => {
  const extracted = phaseExtract(ctx);
  if (extracted === null) {
    return null;
  }
  const result = await phaseClassifyAndFinalize(extracted, ctx);
  return result;
};

export { log, processOneInvoice };
export type { AskFn };
