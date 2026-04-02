/**
 * パイプライン実行ロジック
 * ハーネス・エージェント・ナレッジの呼び出しを集約する
 */

/* eslint-disable no-console -- CLIアプリケーション */
/* eslint-disable sort-imports -- eslint-disableブロック対策 */
/* eslint-disable require-await -- フォーマッタがasyncを付与する */

import type { AiCallFn } from "../agent/index.js";
import type { InvoiceData, JournalEntry, PipelineResult } from "../harness/types.js";
import type { KnowledgeStore } from "../knowledge/store.js";
import { beforeApproval } from "../harness/lifecycle.js";
import { determineHumanReview } from "../harness/checker.js";
import { estimateJournalEntries, extractInvoiceData } from "../agent/index.js";
import { formatChecklistProgress } from "../harness/planner.js";
import { generateSuggestions } from "../knowledge/improver.js";
import { askUser, handleSuggestions, printHeader, printJournalEntries } from "./ui.js";

const PERCENTAGE = 100;
const DECIMAL_PLACES = 1;

interface PipelineInput {
  invoice: InvoiceData;
  entries: JournalEntry[];
  confidence: number;
  store: KnowledgeStore;
}

/** AI付きパイプライン: 抽出→推定 */
const runAiSteps = async (
  callAi: AiCallFn,
  invoiceText: string,
  store: KnowledgeStore,
): Promise<PipelineInput> => {
  printHeader("Step 1: 請求書データ抽出（AIエージェント）");
  const invoice = await extractInvoiceData(callAi, invoiceText);
  console.log(`  取引先: ${invoice.vendor ?? "不明"}`);
  console.log(`  合計金額: ${invoice.totalAmount?.toLocaleString() ?? "不明"}円`);
  console.log(`  品目数: ${invoice.lineItems.length}件\n`);

  printHeader("Step 2: 仕訳推定（AIエージェント + ナレッジ）");
  const { confidence, entries } = await estimateJournalEntries(callAi, invoice, store);
  console.log(`  確信度: ${(confidence * PERCENTAGE).toFixed(DECIMAL_PLACES)}%\n`);
  printJournalEntries(entries);

  return { confidence, entries, invoice, store };
};

/** バリデーション結果を表示する */
const showValidation = (input: PipelineInput): PipelineResult => {
  const { checklist, hookResult } = beforeApproval(input.invoice, input.entries, []);

  printHeader("Step 3: バリデーション（ハーネス）");
  console.log(formatChecklistProgress(checklist));
  for (const msg of hookResult.messages) {
    console.log(`  ${hookResult.passed ? "OK" : "!!"} ${msg}`);
  }

  return {
    checklist,
    invoice: input.invoice,
    journalEntries: input.entries,
    requiresHumanReview: false,
    reviewReasons: [],
    suggestions: [],
    validation: { errors: [], valid: hookResult.passed, warnings: [] },
  };
};

/** レビュー理由を表示しユーザー承認を求める */
const promptForApproval = async (reasons: string[]): Promise<boolean> => {
  console.log("  ヒューマンレビューが必要です:");
  for (const reason of reasons) {
    console.log(`    - ${reason}`);
  }
  const approval = await askUser("\n  この仕訳を承認しますか？ (y/n): ");
  const approved = approval.toLowerCase() === "y";
  console.log(approved ? "  -> 承認されました。" : "  -> 却下されました。");
  return approved;
};

/** ヒューマンレビューを実行し、承認されたかを返す */
const runHumanReview = async (result: PipelineResult, confidence: number): Promise<boolean> => {
  printHeader("Step 4: ヒューマン・イン・ザ・ループ");
  const review = determineHumanReview(result, confidence);
  if (!review.required) {
    console.log("  全チェック通過: 自動承認されました。");
    return true;
  }
  return promptForApproval(review.reasons);
};

/** ナレッジ改善を実行する */
const runKnowledgeImprovement = async (input: PipelineInput): Promise<void> => {
  const suggestions = input.entries.flatMap((entry) =>
    generateSuggestions({
      correctedEntry: entry,
      originalEntry: entry,
      store: input.store,
      vendor: input.invoice.vendor ?? "不明",
    }),
  );
  await handleSuggestions(suggestions, input.store);
};

/** バリデーション→承認→改善のパイプライン後半 */
const runValidationAndApproval = async (input: PipelineInput): Promise<void> => {
  const result = showValidation(input);
  const approved = await runHumanReview(result, input.confidence);
  if (approved) {
    await runKnowledgeImprovement(input);
  }
};

export { runAiSteps, runValidationAndApproval };
export type { PipelineInput };
