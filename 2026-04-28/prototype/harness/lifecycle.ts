import type {
  ExtractionResult,
  HookContext,
  HookPhase,
  HookResult,
  Invoice,
  JournalEntry,
} from "../types.ts";
import { checkDebitCreditBalance, checkExtractionQuality } from "./checker.ts";
import { getAccounts, getCorrections, getVendors } from "../knowledge/store.ts";

const ZERO = 0;

type HookHandler = (ctx: HookContext) => HookResult;

const hookRegistry = new Map<HookPhase, HookHandler[]>();

const registerHook = (phase: HookPhase, handler: HookHandler): void => {
  const existing = hookRegistry.get(phase) ?? [];
  existing.push(handler);
  hookRegistry.set(phase, existing);
};

const executeHooks = (phase: HookPhase, ctx: HookContext): HookResult => {
  const handlers = hookRegistry.get(phase) ?? [];
  const allMessages: string[] = [];
  let allPassed = true;

  for (const handler of handlers) {
    const result = handler(ctx);
    allMessages.push(...result.messages);
    if (!result.passed) {
      allPassed = false;
    }
  }

  return { messages: allMessages, passed: allPassed };
};

const buildContext = (invoice: Invoice): HookContext => ({
  accountMaster: getAccounts(),
  corrections: getCorrections(),
  invoice,
  vendorMappings: getVendors(),
});

const enrichContextWithExtraction = (
  ctx: HookContext,
  extraction: ExtractionResult,
): HookContext => ({
  ...ctx,
  extractionResult: extraction,
});

const enrichContextWithJournal = (ctx: HookContext, journal: JournalEntry): HookContext => ({
  ...ctx,
  journalEntry: journal,
});

const registerDefaultHooks = (): void => {
  registerHook("before:extract", (ctx) => ({
    messages: [
      `コンテキスト注入完了: ${String(ctx.vendorMappings.length)}件の仕入先マスタ, ${String(ctx.accountMaster.length)}件の勘定科目`,
    ],
    passed: true,
  }));

  registerHook("after:extract", (ctx) => {
    if (ctx.extractionResult === null || !ctx.extractionResult) {
      return { messages: ["ERROR: 抽出結果がありません"], passed: false };
    }
    return checkExtractionQuality(ctx.extractionResult);
  });

  registerHook("after:classify", (ctx) => {
    if (ctx.extractionResult === null || !ctx.extractionResult) {
      return { messages: ["ERROR: 分類結果がありません"], passed: false };
    }
    const allAssigned = ctx.extractionResult.extractedLines.every(
      (line) => line.suggestedAccountCode.length > ZERO,
    );
    return {
      messages: [allAssigned ? "OK: 全明細に勘定科目が割当済み" : "ERROR: 未割当の明細があります"],
      passed: allAssigned,
    };
  });

  registerHook("after:journalize", (ctx) => {
    if (ctx.journalEntry === null || !ctx.journalEntry) {
      return { messages: ["ERROR: 仕訳データがありません"], passed: false };
    }
    return checkDebitCreditBalance(ctx.journalEntry);
  });
};

export {
  buildContext,
  enrichContextWithExtraction,
  enrichContextWithJournal,
  executeHooks,
  registerDefaultHooks,
  registerHook,
};
