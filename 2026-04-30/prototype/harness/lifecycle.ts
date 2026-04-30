import type {
  CompletionChecklist,
  ExtractedTransaction,
  HookContext,
  HookResult,
  JournalEntry,
  LifecycleStep,
} from "../types.js";
import { createChecklist, formatProgress, isComplete } from "./planner.js";
import { validateExtraction, validateJournal } from "./checker.js";

type HookFn = (ctx: HookContext) => HookResult;

const NO_ERRORS = 0;

interface LifecycleHooks {
  before: Map<LifecycleStep, HookFn[]>;
  after: Map<LifecycleStep, HookFn[]>;
}

interface HarnessState {
  checklists: Map<string, CompletionChecklist>;
  hooks: LifecycleHooks;
  log: string[];
}

interface RegisterHookParams {
  harness: HarnessState;
  phase: "before" | "after";
  step: LifecycleStep;
  hook: HookFn;
}

const createHarness = (): HarnessState => ({
  checklists: new Map(),
  hooks: {
    after: new Map(),
    before: new Map(),
  },
  log: [],
});

const registerHook = (params: RegisterHookParams): void => {
  const map = params.harness.hooks[params.phase];
  const existing = map.get(params.step) ?? [];
  existing.push(params.hook);
  map.set(params.step, existing);
};

const runHooks = (
  harness: HarnessState,
  phase: "before" | "after",
  ctx: HookContext,
): HookResult => {
  const hooks = harness.hooks[phase].get(ctx.step) ?? [];
  const allErrors: string[] = [];
  const allWarnings: string[] = [];

  for (const hook of hooks) {
    const result = hook(ctx);
    allErrors.push(...result.errors);
    allWarnings.push(...result.warnings);
  }

  return { errors: allErrors, passed: allErrors.length === NO_ERRORS, warnings: allWarnings };
};

const initTransaction = (harness: HarnessState, transactionId: string): CompletionChecklist => {
  const checklist = createChecklist(transactionId);
  harness.checklists.set(transactionId, checklist);
  harness.log.push(`[INIT] 取引 ${transactionId} を開始`);
  return checklist;
};

const markStep = (
  harness: HarnessState,
  transactionId: string,
  step: keyof Omit<CompletionChecklist, "transactionId">,
): void => {
  const checklist = harness.checklists.get(transactionId);
  if (checklist) {
    checklist[step] = true;
    harness.log.push(`[STEP] ${transactionId}: ${step} = done`);
  }
};

const getStatus = (
  harness: HarnessState,
  transactionId: string,
): { complete: boolean; progress: string } => {
  const checklist = harness.checklists.get(transactionId);
  if (!checklist) {
    return { complete: false, progress: "取引が見つかりません" };
  }
  return { complete: isComplete(checklist), progress: formatProgress(checklist) };
};

const PASS_RESULT: HookResult = { errors: [], passed: true, warnings: [] };

const isExtractedTransaction = (data: unknown): data is ExtractedTransaction =>
  typeof data === "object" &&
  data !== null &&
  "counterparty" in data &&
  "amount" in data &&
  "date" in data;

const isJournalEntry = (data: unknown): data is JournalEntry =>
  typeof data === "object" && data !== null && "lines" in data && "transactionId" in data;

const setupDefaultHooks = (harness: HarnessState): void => {
  registerHook({
    harness,
    hook: (ctx) => (isExtractedTransaction(ctx.data) ? validateExtraction(ctx.data) : PASS_RESULT),
    phase: "after",
    step: "extract",
  });

  registerHook({
    harness,
    hook: (ctx) => (isJournalEntry(ctx.data) ? validateJournal(ctx.data) : PASS_RESULT),
    phase: "after",
    step: "journal_generate",
  });
};

export {
  createHarness,
  getStatus,
  initTransaction,
  markStep,
  registerHook,
  runHooks,
  setupDefaultHooks,
};
export type { HarnessState };
