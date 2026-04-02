/**
 * ハーネス層: ライフサイクルフック
 *
 * なぜハーネスがパイプラインを制御するか:
 * AIエージェントに「次のステップに進んでよいか」を自己判断させると、
 * ドリフト問題（終了条件の誤認、品質の自己過信）が発生する。
 * ハーネスが各ステップの前後にフックを挟み、外部から品質を検証することで、
 * AIのドリフトを防止する。
 */

import type { CompletionChecklist, InvoiceData, JournalEntry, ValidationResult } from "./types.js";
import {
  checkAnomalies,
  checkDuplicate,
  validateAccountCodes,
  validateDebitCreditBalance,
  validateRegistrationNumber,
  validateTaxCalculation,
} from "../deterministic/rules.js";

/** フック実行結果 */
interface HookResult {
  passed: boolean;
  messages: string[];
}

const EMPTY_LENGTH = 0;
const ACCOUNT_CODES_INDEX = 0;
const TAX_VALIDATION_INDEX = 2;

/** 必須フィールドの存在確認（抽出後に実行） */
const afterExtraction = (invoice: InvoiceData): HookResult => {
  const missing: string[] = [];
  if (invoice.vendor === null || invoice.vendor === "") {
    missing.push("発行元（取引先名）");
  }
  if (invoice.totalAmount === null) {
    missing.push("合計金額");
  }
  if (invoice.issueDate === null || invoice.issueDate === "") {
    missing.push("発行日");
  }
  if (invoice.lineItems.length === EMPTY_LENGTH) {
    missing.push("品目（1件以上）");
  }
  return {
    messages:
      missing.length > EMPTY_LENGTH
        ? [`未抽出の必須フィールド: ${missing.join(", ")}`]
        : ["全必須フィールドの抽出を確認"],
    passed: missing.length === EMPTY_LENGTH,
  };
};

/** 仕訳推定後のバリデーション（仕訳推定後に実行） */
const afterJournalEstimation = (
  invoice: InvoiceData,
  entries: JournalEntry[],
): { hookResult: HookResult; validations: ValidationResult[] } => {
  const validations = [
    validateAccountCodes(entries),
    validateDebitCreditBalance(entries),
    validateTaxCalculation(invoice),
    validateRegistrationNumber(invoice.registrationNumber),
  ];

  const allErrors = validations.flatMap((vr) => vr.errors);
  const allWarnings = validations.flatMap((vr) => vr.warnings);
  const passed = allErrors.length === EMPTY_LENGTH;

  return {
    hookResult: {
      messages: [...allErrors, ...allWarnings],
      passed,
    },
    validations,
  };
};

/** 承認前の最終チェック（承認フロー直前に実行） */
const beforeApproval = (
  invoice: InvoiceData,
  entries: JournalEntry[],
  processedInvoices: { invoiceNumber: string; vendor: string; totalAmount: number }[],
): { checklist: CompletionChecklist; hookResult: HookResult } => {
  const extractionResult = afterExtraction(invoice);
  const journalResult = afterJournalEstimation(invoice, entries);
  const duplicateResult = checkDuplicate(invoice, processedInvoices);
  const anomalyResult = checkAnomalies(invoice);

  const checklist: CompletionChecklist = {
    accountCodesValid: journalResult.validations[ACCOUNT_CODES_INDEX]?.valid ?? false,
    allRequiredFieldsExtracted: extractionResult.passed,
    anomalyCheckDone: true,
    duplicateCheckDone: true,
    taxCalculationMatches: journalResult.validations[TAX_VALIDATION_INDEX]?.valid ?? false,
  };

  const allPassed =
    extractionResult.passed &&
    journalResult.hookResult.passed &&
    duplicateResult.valid &&
    anomalyResult.valid;

  const messages = [
    ...extractionResult.messages,
    ...journalResult.hookResult.messages,
    ...duplicateResult.errors,
    ...duplicateResult.warnings,
    ...anomalyResult.errors,
    ...anomalyResult.warnings,
  ];

  return {
    checklist,
    hookResult: { messages, passed: allPassed },
  };
};

export { afterExtraction, afterJournalEstimation, beforeApproval };
export type { HookResult };
