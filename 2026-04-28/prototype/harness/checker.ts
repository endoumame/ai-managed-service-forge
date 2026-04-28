import type { ExtractionResult, HookResult, JournalEntry } from "../types.ts";
import {
  verifyAccountCodes,
  verifyDebitCreditBalance,
  verifyTaxAmounts,
} from "../deterministic/rules.ts";

const ZERO = 0;

const collectLineErrors = (extraction: ExtractionResult): string[] =>
  extraction.extractedLines
    .filter((line) => line.suggestedAccountCode.length === ZERO)
    .map((line) => `ERROR: 勘定科目コードが未設定 - ${line.description}`);

const collectAnomalyMessages = (extraction: ExtractionResult): string[] =>
  extraction.anomalies.map((anomaly) => `${anomaly.severity.toUpperCase()}: ${anomaly.message}`);

const checkExtractionQuality = (extraction: ExtractionResult): HookResult => {
  const errors: string[] = [];

  if (extraction.extractedLines.length === ZERO) {
    errors.push("ERROR: 抽出された明細行がありません");
  }
  errors.push(...collectLineErrors(extraction));

  const anomalyMsgs = collectAnomalyMessages(extraction);
  const passed = errors.length === ZERO;
  const messages = [...errors, ...anomalyMsgs];

  if (passed) {
    messages.push("OK: 抽出品質チェック通過");
  }

  return { messages, passed };
};

const checkAccountCodesValidity = (entry: JournalEntry): HookResult => {
  const result = verifyAccountCodes(entry.lines);
  const messages: string[] = [];

  if (result.passed) {
    messages.push("OK: 全勘定科目コードが有効");
  } else {
    messages.push(`ERROR: 無効な勘定科目コード: ${result.invalidCodes.join(", ")}`);
  }

  return { messages, passed: result.passed };
};

const checkDebitCreditBalance = (entry: JournalEntry): HookResult => {
  const balanced = verifyDebitCreditBalance(entry.lines);
  const messages = balanced
    ? ["OK: 貸借バランス一致"]
    : [
        `ERROR: 貸借バランス不一致 - 借方: ${String(entry.totalDebit)}, 貸方: ${String(entry.totalCredit)}`,
      ];

  return { messages, passed: balanced };
};

const checkTaxConsistency = (extraction: ExtractionResult): HookResult => {
  const result = verifyTaxAmounts(extraction);
  return {
    messages: [result.message],
    passed: result.passed,
  };
};

const runAllChecks = (
  extraction: ExtractionResult,
  entry: JournalEntry,
): { allPassed: boolean; allMessages: string[] } => {
  const checks = [
    checkExtractionQuality(extraction),
    checkAccountCodesValidity(entry),
    checkDebitCreditBalance(entry),
    checkTaxConsistency(extraction),
  ];

  const allMessages = checks.flatMap((check) => check.messages);
  const allPassed = checks.every((check) => check.passed);

  return { allMessages, allPassed };
};

export {
  checkAccountCodesValidity,
  checkDebitCreditBalance,
  checkExtractionQuality,
  checkTaxConsistency,
  runAllChecks,
};
