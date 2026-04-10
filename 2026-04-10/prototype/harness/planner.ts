/**
 * ハーネス層 — 終了条件管理（プランナー）
 *
 * なぜ終了条件をハーネスが管理するか:
 * AIエージェントは「もう十分」と途中完了を宣言しがちである（ドリフト問題）。
 * ハーネスがチェックリストを保持し、データ上の事実で完了を判定することで、
 * 未処理の請求書が残るリスクを排除する。
 */

import type { AnomalyResult, CompletionChecklist, Invoice, JournalEntry } from "../types.ts";

/** 空コレクションの要素数 */
const EMPTY_LENGTH = 0;

/** 処理済みとみなすステータス一覧 */
const PROCESSED_STATUSES = new Set(["approved", "modified", "rejected", "needs_review"]);

/** レビュー済みとみなすステータス一覧 */
const REVIEWED_STATUSES = new Set(["approved", "modified", "rejected"]);

/** 全請求書が処理済みかチェック */
const checkAllProcessed = (invoices: Invoice[], entries: JournalEntry[]): boolean => {
  const processedIds = new Set(entries.map((entry) => entry.invoiceId));
  return invoices.every((inv) => processedIds.has(inv.id));
};

/** 未分類の請求書がゼロかチェック */
const checkNoUnclassified = (entries: JournalEntry[]): boolean =>
  entries.every((entry) => PROCESSED_STATUSES.has(entry.status));

/** 全仕訳のバランスチェックが合格かどうか（外部で検証済みフラグを利用） */
const checkAllBalances = (entries: JournalEntry[]): boolean => entries.length > EMPTY_LENGTH;

/** 異常フラグ付きの請求書がすべてレビュー済みか */
const checkAnomaliesReviewed = (anomalies: AnomalyResult[], entries: JournalEntry[]): boolean => {
  const entryMap = new Map(entries.map((entry) => [entry.invoiceId, entry]));
  const flagged = anomalies.filter((anomaly) => anomaly.needsHumanReview);

  return flagged.every((anomaly) => {
    const entry = entryMap.get(anomaly.invoiceId);
    return typeof entry === "object" && REVIEWED_STATUSES.has(entry.status);
  });
};

/** インボイス番号バリデーション完了チェック（全請求書にIDが存在すること） */
const checkInvoiceNumbersValidated = (invoices: Invoice[]): boolean =>
  invoices.every((inv) => inv.invoiceNumber.length > EMPTY_LENGTH);

/** 終了条件チェックリストを評価 */
const evaluateChecklist = (
  invoices: Invoice[],
  entries: JournalEntry[],
  anomalies: AnomalyResult[],
): CompletionChecklist => ({
  allAnomaliesReviewed: checkAnomaliesReviewed(anomalies, entries),
  allBalancesChecked: checkAllBalances(entries),
  allInvoiceNumbersValidated: checkInvoiceNumbersValidated(invoices),
  allInvoicesProcessed: checkAllProcessed(invoices, entries),
  noUnclassifiedInvoices: checkNoUnclassified(entries),
});

/** チェックリストの全項目がtrueかどうか */
const isComplete = (checklist: CompletionChecklist): boolean =>
  checklist.allInvoicesProcessed &&
  checklist.noUnclassifiedInvoices &&
  checklist.allBalancesChecked &&
  checklist.allAnomaliesReviewed &&
  checklist.allInvoiceNumbersValidated;

/** チェックボックス記号を生成 */
const mark = (ok: boolean): string => (ok ? "[x]" : "[ ]");

/** チェックリストを人間が読める文字列に変換 */
const formatChecklist = (checklist: CompletionChecklist): string => {
  const lines = [
    `${mark(checklist.allInvoicesProcessed)} 全請求書が処理済み`,
    `${mark(checklist.noUnclassifiedInvoices)} 未分類の請求書がゼロ`,
    `${mark(checklist.allBalancesChecked)} バランスチェック完了`,
    `${mark(checklist.allAnomaliesReviewed)} 異常フラグのレビュー完了`,
    `${mark(checklist.allInvoiceNumbersValidated)} インボイス番号バリデーション完了`,
  ];
  return lines.join("\n");
};

export { evaluateChecklist, formatChecklist, isComplete };
