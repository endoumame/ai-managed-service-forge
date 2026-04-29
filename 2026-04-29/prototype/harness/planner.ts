import type { CompletionChecklist, ValidationResult } from "../types.ts";

const SUM_INITIAL = 0;
const STEP = 1;
const PERCENT = 100;

interface ProcessingState {
  checklist: CompletionChecklist;
  extractedCount: number;
  failedExtractions: string[];
  journalCount: number;
  pendingApprovals: string[];
  totalInvoices: number;
}

interface JournalRecordInput {
  balanceValid: boolean;
  state: ProcessingState;
}

const createState = (totalInvoices: number): ProcessingState => ({
  checklist: {
    allInvoicesExtracted: false,
    allJournalsAssigned: false,
    debitCreditBalanced: false,
    highRiskFlagged: false,
    noNumericDiscrepancies: false,
  },
  extractedCount: SUM_INITIAL,
  failedExtractions: [],
  journalCount: SUM_INITIAL,
  pendingApprovals: [],
  totalInvoices,
});

const recordExtraction = (
  state: ProcessingState,
  invoiceId: string,
  validation: ValidationResult,
): ProcessingState => {
  const next = { ...state, extractedCount: state.extractedCount + STEP };
  if (!validation.passed) {
    next.failedExtractions = [...state.failedExtractions, invoiceId];
  }
  next.checklist = {
    ...next.checklist,
    allInvoicesExtracted: next.extractedCount >= state.totalInvoices,
    noNumericDiscrepancies: next.failedExtractions.length === SUM_INITIAL,
  };
  return next;
};

const recordJournal = (input: JournalRecordInput): ProcessingState => {
  const next = { ...input.state, journalCount: input.state.journalCount + STEP };
  next.checklist = {
    ...next.checklist,
    allJournalsAssigned: next.journalCount >= input.state.extractedCount,
    debitCreditBalanced: input.balanceValid && input.state.checklist.debitCreditBalanced,
  };
  return next;
};

const recordHighRiskFlagged = (state: ProcessingState): ProcessingState => ({
  ...state,
  checklist: { ...state.checklist, highRiskFlagged: true },
});

const getProgress = (state: ProcessingState): string => {
  const pct =
    state.totalInvoices > SUM_INITIAL
      ? Math.round((state.extractedCount / state.totalInvoices) * PERCENT)
      : SUM_INITIAL;
  return [
    `進捗: ${pct}% (${state.extractedCount}/${state.totalInvoices})`,
    `仕訳済: ${state.journalCount}`,
    `承認待ち: ${state.pendingApprovals.length}`,
    `エラー: ${state.failedExtractions.length}`,
  ].join(" | ");
};

export type { ProcessingState, JournalRecordInput };
export { createState, recordExtraction, recordJournal, recordHighRiskFlagged, getProgress };
