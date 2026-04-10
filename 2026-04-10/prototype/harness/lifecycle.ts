/**
 * ハーネス層 — ライフサイクルフック定義
 *
 * なぜライフサイクルフックが必要か:
 * AIエージェントの処理前後に決定論的なバリデーションを挟むことで、
 * エージェントの出力品質をハーネスが保証する。エージェント単体では
 * 「税額が正しいか」「仕訳がバランスしているか」を100%保証できない。
 */

import type { HookPhase, HookResult, Invoice, JournalEntry } from "../types.ts";
import {
  validateDate,
  validateInvoiceRegistrationNumber,
  validateInvoiceTax,
  validateJournalBalance,
} from "../deterministic/rules.ts";

/** 空コレクションの要素数 */
const EMPTY_LENGTH = 0;

/** エラー配列からpass判定を生成するヘルパー */
const buildResult = (phase: HookPhase, errors: string[], warnings: string[]): HookResult => ({
  errors,
  passed: errors.length === EMPTY_LENGTH,
  phase,
  warnings,
});

/** 必須フィールドの存在チェック（before-extract） */
const runBeforeExtract = (invoice: Invoice): HookResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (invoice.items.length === EMPTY_LENGTH) {
    errors.push("明細行が存在しません");
  }

  const dateResult = validateDate(invoice.issueDate);
  if (!dateResult.valid && typeof dateResult.error === "string") {
    errors.push(dateResult.error);
  }

  return buildResult("before-extract", errors, warnings);
};

/** 抽出データの整合性チェック（after-extract） */
const runAfterExtract = (invoice: Invoice): HookResult => {
  const warnings: string[] = [];
  const taxResult = validateInvoiceTax(invoice);
  const regResult = validateInvoiceRegistrationNumber(invoice.invoiceRegistrationNumber);

  const errors = [...taxResult.errors];
  if (!regResult.valid && typeof regResult.error === "string") {
    warnings.push(regResult.error);
  }

  return buildResult("after-extract", errors, warnings);
};

/** 仕訳結果のバランスチェック（after-classify） */
const runAfterClassify = (entry: JournalEntry): HookResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const balance = validateJournalBalance(entry.lines);

  if (!balance.valid) {
    errors.push(`仕訳バランス不一致: 借方=${balance.debitTotal}円, 貸方=${balance.creditTotal}円`);
  }

  return buildResult("after-classify", errors, warnings);
};

/** 指定フェーズのフックを実行 */
const runHook = (
  phase: HookPhase,
  context: { invoice?: Invoice; journalEntry?: JournalEntry },
): HookResult => {
  if (phase === "before-extract" && context.invoice) {
    return runBeforeExtract(context.invoice);
  }
  if (phase === "after-extract" && context.invoice) {
    return runAfterExtract(context.invoice);
  }
  if (phase === "after-classify" && context.journalEntry) {
    return runAfterClassify(context.journalEntry);
  }

  return buildResult(phase, [], []);
};

export { runAfterClassify, runAfterExtract, runBeforeExtract, runHook };
