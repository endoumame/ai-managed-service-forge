/*
 * InvoiceForge デモエントリポイント
 *
 * 請求書処理パイプラインの全工程を実行し、
 * ハーネスによる品質管理とナレッジ改善ループを実証する。
 *
 * 実行: cd prototype && npx tsx demo/run.ts
 */

import { DIVIDER, SUB_DIVIDER, log, logResults, logStage } from "./logger.ts";
import { INITIAL_KNOWLEDGE, SAMPLE_CORRECTIONS, SAMPLE_INVOICES } from "./sample-data.ts";
import type { KnowledgeEntry, RawInvoice } from "../types.ts";
import { advanceStage, createPlan, validateCurrentStage } from "../harness/planner.ts";
import { createKnowledgeStore, updateKnowledge } from "../knowledge/store.ts";
import type { PipelinePlan } from "../harness/planner.ts";
import { extractInvoiceData } from "../agent/index.ts";
import { generateJournalEntries } from "../deterministic/rules.ts";
import { generateProposals } from "../knowledge/improver.ts";

const ZERO_AMOUNT = 0;
const ACCOUNT_PAD_WIDTH = 12;

interface InvoiceResult {
  plan: PipelinePlan;
  knowledge: KnowledgeEntry[];
}

/* ============================================================
 * 表示ヘルパー（参照される前に定義）
 * ============================================================ */

/** 仕訳結果を表示 */
const displayJournalEntries = (plan: PipelinePlan): void => {
  logStage("生成された仕訳");
  if (!plan.context.journalEntry) {
    return;
  }
  for (const entry of plan.context.journalEntry.entries) {
    const debitStr = entry.debit > ZERO_AMOUNT ? `借方: ${entry.debit}円` : "";
    const creditStr = entry.credit > ZERO_AMOUNT ? `貸方: ${entry.credit}円` : "";
    log(
      `  ${entry.account.padEnd(ACCOUNT_PAD_WIDTH)} ${debitStr}${creditStr}  (${entry.description})`,
    );
  }
};

/** レビュー理由を表示し承認を実行 */
const displayReviewAndApprove = (plan: PipelinePlan): void => {
  if (plan.context.humanReviewRequired) {
    logStage("ヒューマン・イン・ザ・ループ: レビュー要求");
    log("  レビュー理由:");
    for (const reason of plan.context.humanReviewReasons) {
      log(`    - ${reason}`);
    }
    log("  -> [デモ] 自動承認");
  } else {
    log("\n  -> 自動承認（レビュー不要）");
  }
  if (plan.context.journalEntry) {
    plan.context.journalEntry.status = "approved";
  }
};

/** 提案内容を表示 */
const displayProposals = (proposals: ReturnType<typeof generateProposals>): void => {
  for (const proposal of proposals) {
    log(`  [提案] ${proposal.description}`);
    log(`    種別: ${proposal.type} / 根拠: ${proposal.evidence.join(", ")}`);
    log(`    ステータス: ${proposal.status} (人間の承認待ち)`);
  }
};

/* ============================================================
 * パイプラインステージ（後ろのステージから順に定義）
 * ============================================================ */

/** ヒューマンレビューの処理（デモでは自動承認） */
const handleHumanReview = async (
  plan: PipelinePlan,
  knowledge: KnowledgeEntry[],
): Promise<InvoiceResult> => {
  displayReviewAndApprove(plan);
  await advanceStage(plan);
  return { knowledge, plan };
};

/** レビューステージの処理 */
const processReviewStage = async (
  plan: PipelinePlan,
  knowledge: KnowledgeEntry[],
): Promise<InvoiceResult> => {
  const toReview = await advanceStage(plan);
  logResults(toReview.results);
  const reviewValid = await validateCurrentStage(plan);
  logResults(reviewValid.results);

  displayJournalEntries(plan);
  return handleHumanReview(plan, knowledge);
};

/** 仕訳ステージの処理 */
const processJournalStage = async (
  plan: PipelinePlan,
  invoice: RawInvoice,
  knowledge: KnowledgeEntry[],
): Promise<InvoiceResult> => {
  const toJournalize = await advanceStage(plan);
  logResults(toJournalize.results);

  if (plan.context.extractedData) {
    plan.context.journalEntry = generateJournalEntries(invoice.id, plan.context.extractedData);
  }
  const toJournalized = await advanceStage(plan);
  logResults(toJournalized.results);

  const journalValid = await validateCurrentStage(plan);
  logResults(journalValid.results);

  return processReviewStage(plan, knowledge);
};

/** 抽出ステージの処理 */
const processExtractStage = async (
  plan: PipelinePlan,
  invoice: RawInvoice,
  knowledge: KnowledgeEntry[],
): Promise<boolean> => {
  const toExtract = await advanceStage(plan);
  logResults(toExtract.results);
  if (!toExtract.proceed) {
    return false;
  }

  plan.context.extractedData = extractInvoiceData(invoice, knowledge);
  const toExtracted = await advanceStage(plan);
  logResults(toExtracted.results);

  const extractValid = await validateCurrentStage(plan);
  logResults(extractValid.results);
  return true;
};

/** 単一の請求書を処理するパイプライン */
const processInvoice = async (
  invoice: RawInvoice,
  knowledge: KnowledgeEntry[],
): Promise<InvoiceResult> => {
  logStage(`請求書処理開始: ${invoice.id} (${invoice.vendor})`);
  const plan = createPlan(invoice);

  const extracted = await processExtractStage(plan, invoice, knowledge);
  if (!extracted) {
    return { knowledge, plan };
  }

  return processJournalStage(plan, invoice, knowledge);
};

/* ============================================================
 * ナレッジ管理とメインループ
 * ============================================================ */

/** ナレッジ改善提案のデモ */
const demoKnowledgeImprovement = (knowledge: KnowledgeEntry[]): void => {
  logStage("ナレッジ自動改善ループ デモ");
  log(`  修正履歴: ${SAMPLE_CORRECTIONS.length}件をシミュレーション`);
  log(`  ${SUB_DIVIDER}`);

  const proposals = generateProposals(knowledge, SAMPLE_CORRECTIONS);
  if (proposals.length > ZERO_AMOUNT) {
    displayProposals(proposals);
  } else {
    log("  改善提案なし（修正回数が閾値未満）");
  }
};

/** 承認済み仕訳からナレッジを学習 */
const learnFromResult = (
  result: { plan: PipelinePlan },
  knowledge: KnowledgeEntry[],
): KnowledgeEntry[] => {
  const { journalEntry, extractedData } = result.plan.context;
  if (journalEntry?.status !== "approved" || !extractedData) {
    return knowledge;
  }

  let updated = knowledge;
  for (const item of extractedData.items) {
    updated = updateKnowledge(updated, {
      account: item.suggestedAccount,
      description: item.description,
      vendor: extractedData.vendor,
    });
  }
  return updated;
};

/** 請求書リストを再帰的に順次処理 */
const processInvoicesSequentially = async (
  remaining: RawInvoice[],
  knowledge: KnowledgeEntry[],
  store: ReturnType<typeof createKnowledgeStore>,
): Promise<KnowledgeEntry[]> => {
  if (remaining.length === ZERO_AMOUNT) {
    return knowledge;
  }
  const [first, ...rest] = remaining;
  const result = await processInvoice(first, knowledge);
  const updated = learnFromResult(result, knowledge);
  store.set(updated);
  return processInvoicesSequentially(rest, updated, store);
};

/** メイン実行 */
const main = async (): Promise<void> => {
  log(DIVIDER);
  log("  InvoiceForge - AIマネージドサービス プロトタイプ");
  log(DIVIDER);

  const store = createKnowledgeStore(INITIAL_KNOWLEDGE);
  const finalKnowledge = await processInvoicesSequentially(SAMPLE_INVOICES, store.getAll(), store);

  demoKnowledgeImprovement(finalKnowledge);
  logStage("処理完了サマリ");
  log(`  処理請求書数: ${SAMPLE_INVOICES.length}`);
  log(`  ナレッジエントリ数: ${finalKnowledge.length}`);
  log(`\n${DIVIDER}`);
};

await main();
