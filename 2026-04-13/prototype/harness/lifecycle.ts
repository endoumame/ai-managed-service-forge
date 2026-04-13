/**
 * ハーネス層 — ライフサイクルフック定義
 *
 * なぜライフサイクルフックか:
 * AIエージェントの各処理ステップの前後に「品質ゲート」を挟むことで、
 * AIの出力が期待品質を満たさない場合に早期検出・差し戻しを行う。
 * これが「ハーネス」の中核機能であり、AIエージェント単体との決定的な差。
 */

/* eslint-disable no-magic-numbers, sort-imports, typescript-eslint/strict-boolean-expressions */

import type {
  ChecklistItem,
  HookResult,
  InvoiceInput,
  JournalEntry,
  ParsedInvoice,
  ValidationError,
} from "../types/index.js";
import { runAllValidations } from "../deterministic/rules.js";
import { getPatternBasedConfidence } from "../knowledge/improver.js";

const CONFIDENCE_THRESHOLD = 0.8;
const PATTERN_MATCH_THRESHOLD = 0.3;
const MIN_TEXT_LENGTH = 20;

// ── before:parse — 入力データの事前検証 ──

const beforeParse = (input: InvoiceInput): HookResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!input.rawText || input.rawText.trim().length === 0) {
    errors.push("請求書テキストが空です");
  }
  if (input.rawText && input.rawText.trim().length < MIN_TEXT_LENGTH) {
    warnings.push("請求書テキストが短すぎます（20文字未満）。解析精度が低下する可能性があります");
  }
  if (!/\d{1,3}(,\d{3})*/.test(input.rawText)) {
    warnings.push("テキスト中に金額と思われる数値が見つかりません");
  }

  return { errors, passed: errors.length === 0, warnings };
};

// ── ヘルパー: バリデーションエラーを分類する ──

const classifyValidationErrors = (
  validationErrors: ValidationError[],
): { errors: string[]; warnings: string[] } => {
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const ve of validationErrors) {
    const msg = `[${ve.field}] ${ve.message}`;
    if (ve.severity === "error") {
      errors.push(msg);
    } else {
      warnings.push(msg);
    }
  }
  return { errors, warnings };
};

// ── ヘルパー: ナレッジベース照合の警告を生成 ──

const checkPatternWarnings = (journal: JournalEntry): string[] => {
  const warnings: string[] = [];
  for (const entry of journal.entries) {
    if (entry.debit > 0) {
      const pc = getPatternBasedConfidence(journal.vendor, entry.accountCode);
      if (pc > 0 && pc < PATTERN_MATCH_THRESHOLD) {
        warnings.push(
          `科目 ${entry.accountName}(${entry.accountCode}): 過去パターンとの一致率が低い (${(pc * 100).toFixed(1)}%)`,
        );
      }
    }
  }
  return warnings;
};

// ── after:classify — AI仕訳推定後の品質ゲート ──

const afterClassify = (
  invoice: ParsedInvoice,
  journal: JournalEntry,
): HookResult & { validationErrors: ValidationError[] } => {
  const validation = runAllValidations(invoice, journal);
  const classified = classifyValidationErrors(validation.errors);
  const patternWarnings = checkPatternWarnings(journal);

  if (invoice.confidence < CONFIDENCE_THRESHOLD) {
    classified.warnings.push(
      `AI解析の確信度が低い (${(invoice.confidence * 100).toFixed(1)}%)。人間による確認を推奨します`,
    );
  }

  return {
    errors: classified.errors,
    passed: classified.errors.length === 0,
    validationErrors: validation.errors,
    warnings: [...classified.warnings, ...patternWarnings],
  };
};

// ── before:approve — 承認前の最終確認 ──

const beforeApprove = (checklist: ChecklistItem[]): HookResult => {
  const errors: string[] = [];
  const incomplete = checklist.filter((item) => !item.completed);
  for (const item of incomplete) {
    errors.push(`未完了: ${item.label}${item.detail ? ` (${item.detail})` : ""}`);
  }
  return { errors, passed: errors.length === 0, warnings: [] };
};

export { afterClassify, beforeApprove, beforeParse };
