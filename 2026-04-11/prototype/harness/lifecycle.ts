/**
 * ハーネス: ライフサイクルフック
 *
 * なぜライフサイクルフックが必要か:
 * AIエージェントは「だいたい合ってる」出力を返すが、経理では1円の誤差も許されない。
 * 各処理ステップの前後に決定論的チェックを挟むことで、
 * AIのドリフト（累積的なズレ）をステップ単位で捕捉・修正する。
 *
 * フックは「ゲート」として機能し、チェックを通過しないと次ステップに進めない。
 */

import type { ExtractedInvoice, HookResult, JournalEntry, RawInvoice } from "../types.ts";
import { checkDeviation, validateAmounts } from "./checker.ts";

const AMOUNT_TOLERANCE = 0.01;
const BALANCE_TOLERANCE = 0.01;
const EMPTY = 0;
const INDEX_OFFSET = 1;
const INITIAL_SUM = 0;

const checkRequiredFields = (invoice: RawInvoice): string[] => {
  const rules: [boolean, string][] = [
    [!invoice.id, "請求書IDが未設定です"],
    [!invoice.vendorName, "取引先名が未設定です"],
    [!invoice.invoiceDate, "請求日が未設定です"],
    [invoice.lineItems.length === EMPTY, "明細行が0件です"],
    [invoice.totalAmount <= EMPTY, `合計金額が不正です: ${invoice.totalAmount}`],
  ];
  return rules.filter(([failed]) => failed).map(([, msg]) => msg);
};

const checkLineItemAmounts = (invoice: RawInvoice): string[] => {
  const warnings: string[] = [];
  for (let idx = 0; idx < invoice.lineItems.length; idx += INDEX_OFFSET) {
    const item = invoice.lineItems[idx];
    const expectedAmount = item.quantity * item.unitPrice;
    if (Math.abs(item.amount - expectedAmount) > AMOUNT_TOLERANCE) {
      warnings.push(
        `明細行${idx + INDEX_OFFSET}: 数量(${item.quantity})×単価(${item.unitPrice})=${expectedAmount} ≠ 記載金額(${item.amount})`,
      );
    }
  }
  return warnings;
};

/**
 * BeforeExtract: 請求書入力の形式バリデーション
 * AIに渡す前に、入力データの基本的な整合性を確認する
 */
const beforeExtract = (invoice: RawInvoice): HookResult => {
  const errors = checkRequiredFields(invoice);
  const warnings = checkLineItemAmounts(invoice);
  const passed = errors.length === EMPTY;
  const messages = passed ? ["入力バリデーション: OK"] : errors;
  return { messages, passed, warnings };
};

/**
 * AfterExtract: AI抽出結果の整合チェック
 * AIが読み取った金額が算術的に正しいか、決定論的に検算する
 */
const afterExtract = (extracted: ExtractedInvoice): HookResult => validateAmounts(extracted);

/**
 * AfterClassify: 仕訳結果の乖離チェック
 * 過去の同一取引先の仕訳と比較し、異常な乖離があれば警告する
 */
const afterClassify = (entry: JournalEntry, historicalEntries: JournalEntry[]): HookResult =>
  checkDeviation(entry, historicalEntries);

const checkEntryStatuses = (entries: JournalEntry[]): string[] => {
  const messages: string[] = [];
  const unprocessed = entries.filter((je) => je.status === "draft");
  if (unprocessed.length > EMPTY) {
    messages.push(
      `未���理の仕訳が${unprocessed.length}件あります: ${unprocessed.map((je) => je.invoiceId).join(", ")}`,
    );
  }
  const flagged = entries.filter((je) => je.status === "flagged");
  if (flagged.length > EMPTY) {
    messages.push(
      `人間確認待ちの仕訳が${flagged.length}件あります: ${flagged.map((je) => je.invoiceId).join(", ")}`,
    );
  }
  return messages;
};

const checkEntryBalances = (entries: JournalEntry[]): string[] => {
  const messages: string[] = [];
  for (const entry of entries) {
    const totalDebit = entry.entries.reduce((sum, line) => sum + line.debit, INITIAL_SUM);
    const totalCredit = entry.entries.reduce((sum, line) => sum + line.credit, INITIAL_SUM);
    if (Math.abs(totalDebit - totalCredit) > BALANCE_TOLERANCE) {
      messages.push(`仕訳${entry.invoiceId}: 借方合計(${totalDebit}) ≠ 貸方合計(${totalCredit})`);
    }
  }
  return messages;
};

/**
 * BeforeFinalize: 最終出力バリデーション
 * すべての仕訳が適切なステータスであることを確認す��
 */
const beforeFinalize = (entries: JournalEntry[]): HookResult => {
  const statusErrors = checkEntryStatuses(entries);
  const balanceErrors = checkEntryBalances(entries);
  const messages = [...statusErrors, ...balanceErrors];
  const passed = messages.length === EMPTY;
  if (passed) {
    messages.push("最終バリデーション: OK — 全仕訳が適切な状態です");
  }
  return { messages, passed, warnings: [] };
};

export { afterClassify, afterExtract, beforeExtract, beforeFinalize };
