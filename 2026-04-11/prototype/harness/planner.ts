/**
 * ハーネス: 終了条件管理（Planner）
 *
 * なぜ終了条件を外部管理するか:
 * AIエージェントのドリフト問題で最も危険なのは「終了条件の誤認」。
 * AIが「もう十分です」と自己申告して途中完了するパターンを防ぐために、
 * 完了判定をAIの外側（ハーネス）に置く。
 *
 * チェックリストの各項目は決定論的に検証可能な条件の��で構成する。
 */

import type { CompletionChecklist, ExtractedInvoice, JournalEntry } from "../types.ts";

const MIN_INVOICE_COUNT = 1;
const MIN_CONFIDENCE = 0;
const MIN_ENTRIES = 0;
const INITIAL_SUM = 0;
const MAX_BALANCE_DIFF = 1;

const checkMark = (ok: boolean): string => (ok ? "[x]" : "[ ]");

const checkBalanced = (journalEntries: JournalEntry[]): boolean =>
  journalEntries.every((je) => {
    const totalDebit = je.entries.reduce((sum, line) => sum + line.debit, INITIAL_SUM);
    const totalCredit = je.entries.reduce((sum, line) => sum + line.credit, INITIAL_SUM);
    return Math.abs(totalDebit - totalCredit) < MAX_BALANCE_DIFF;
  });

const createChecklist = (): CompletionChecklist => ({
  allAmountsValidated: false,
  allEntriesClassified: false,
  allFlaggedItemsReviewed: false,
  allInvoicesExtracted: false,
  outputValidated: false,
});

/**
 * チェックリストの各項目���決定論的に評価���る
 *
 * 各条件はデータの状���から一意に判定できる。AIの「感想」は入らない。
 */
const evaluateChecklist = (
  totalInvoiceCount: number,
  extractedInvoices: ExtractedInvoice[],
  journalEntries: JournalEntry[],
): CompletionChecklist => {
  const allInvoicesExtracted =
    extractedInvoices.length === totalInvoiceCount && totalInvoiceCount >= MIN_INVOICE_COUNT;

  const allAmountsValidated =
    allInvoicesExtracted && extractedInvoices.every((inv) => inv.confidence > MIN_CONFIDENCE);

  const allEntriesClassified =
    journalEntries.length === totalInvoiceCount &&
    journalEntries.every((je) => je.entries.length > MIN_ENTRIES);

  const allFlaggedItemsReviewed = journalEntries.every(
    (je) => je.status !== "flagged" && je.status !== "draft",
  );

  const outputValidated = checkBalanced(journalEntries);

  return {
    allAmountsValidated,
    allEntriesClassified,
    allFlaggedItemsReviewed,
    allInvoicesExtracted,
    outputValidated,
  };
};

const isComplete = (checklist: CompletionChecklist): boolean =>
  checklist.allInvoicesExtracted &&
  checklist.allAmountsValidated &&
  checklist.allEntriesClassified &&
  checklist.allFlaggedItemsReviewed &&
  checklist.outputValidated;

const formatChecklist = (checklist: CompletionChecklist): string => {
  const lines = [
    "=== 終了条件チェックリスト ===",
    `${checkMark(checklist.allInvoicesExtracted)} 全請求書の情報抽出完了`,
    `${checkMark(checklist.allAmountsValidated)} 金額整合チェック全パス`,
    `${checkMark(checklist.allEntriesClassified)} 全仕訳に勘定科目割当済み`,
    `${checkMark(checklist.allFlaggedItemsReviewed)} 警告付き仕訳の人間確認完了`,
    `${checkMark(checklist.outputValidated)} 出力バリデーション通過`,
    "===============================",
  ];
  return lines.join("\n");
};

export { createChecklist, evaluateChecklist, formatChecklist, isComplete };
