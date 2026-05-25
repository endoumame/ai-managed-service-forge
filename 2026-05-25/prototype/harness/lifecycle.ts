// ハーネス層: ライフサイクル管理
// AIエージェントの実行を「包み込み」、各ステップの前後に決定論的チェックを挟む

import type { ExtractedInvoice, HarnessContext, KnowledgeEntry, LifecycleHook } from "../types.ts";

interface HookRegistry {
  "before:extract": LifecycleHook[];
  "after:extract": LifecycleHook[];
  "before:classify": LifecycleHook[];
  "after:classify": LifecycleHook[];
}

const hooks: HookRegistry = {
  "after:classify": [],
  "after:extract": [],
  "before:classify": [],
  "before:extract": [],
};

const registerHook = (event: keyof HookRegistry, hook: LifecycleHook): void => {
  hooks[event].push(hook);
};

// フックは順次実行が必須（各フックの出力が次のフックの入力になる）
const executeHooks = async (
  event: keyof HookRegistry,
  ctx: HarnessContext,
): Promise<HarnessContext> => {
  let current = await Promise.resolve(ctx);
  const pipeline = hooks[event];
  for (const hook of pipeline) {
    current = await hook(current); // eslint-disable-line no-await-in-loop -- sequential by design
  }
  return current;
};

// ── 組み込みフック定義 ──

const normalizeTextHook: LifecycleHook = async (ctx) => {
  const source = await Promise.resolve(ctx.invoice.rawText);
  const rawText = source
    .replaceAll("\r\n", "\n")
    .replaceAll("\t", " ")
    .replaceAll(/ {2,}/g, " ")
    .replaceAll("，", ",")
    .replaceAll("￥", "¥")
    .trim();
  return { ...ctx, invoice: { ...ctx.invoice, rawText } };
};

const isEmpty = (arr: unknown[]): boolean => arr.length === 0; // eslint-disable-line no-magic-numbers
const isNonEmpty = (arr: unknown[]): boolean => !isEmpty(arr);

const detectMissingFields = (extracted: ExtractedInvoice): string[] => {
  const missing: string[] = [];
  if (!extracted.vendorName) {
    missing.push("vendorName");
  }
  if (!extracted.invoiceDate) {
    missing.push("invoiceDate");
  }
  if (isEmpty(extracted.items)) {
    missing.push("items");
  }
  if (!extracted.totalAmount) {
    missing.push("totalAmount");
  }
  return missing;
};

const buildFieldCheckResult = (ctx: HarnessContext, missingFields: string[]): HarnessContext => {
  const hasGaps = isNonEmpty(missingFields);
  const reasons = [...ctx.humanReviewReasons];
  if (hasGaps) {
    reasons.push(`必須項目が未抽出: ${missingFields.join(", ")}`);
  }
  return {
    ...ctx,
    checklist: { ...ctx.checklist, allFieldsExtracted: !hasGaps },
    humanReviewReasons: reasons,
    humanReviewRequired: ctx.humanReviewRequired || hasGaps,
  };
};

const requiredFieldsHook: LifecycleHook = async (ctx) => {
  const extracted = await Promise.resolve(ctx.extracted);
  if (!extracted) {
    return ctx;
  }
  return buildFieldCheckResult(ctx, detectMissingFields(extracted));
};

const injectKnowledgeHook =
  (lookupFn: (vendorName: string) => KnowledgeEntry[]): LifecycleHook =>
  async (ctx) => {
    const extracted = await Promise.resolve(ctx.extracted);
    if (!extracted) {
      return ctx;
    }
    const hints = lookupFn(extracted.vendorName);
    return { ...ctx, knowledgeHints: hints };
  };

const validateJournalHook =
  (validateFn: (ctx: HarnessContext) => Promise<HarnessContext>): LifecycleHook =>
  async (ctx) => {
    const result = await validateFn(ctx);
    return result;
  };

const registerDefaultHooks = (deps: {
  knowledgeLookup: (vendorName: string) => KnowledgeEntry[];
  validateJournal: (ctx: HarnessContext) => Promise<HarnessContext>;
}): void => {
  registerHook("before:extract", normalizeTextHook);
  registerHook("after:extract", requiredFieldsHook);
  registerHook("before:classify", injectKnowledgeHook(deps.knowledgeLookup));
  registerHook("after:classify", validateJournalHook(deps.validateJournal));
};

export {
  registerHook,
  executeHooks,
  normalizeTextHook,
  requiredFieldsHook,
  injectKnowledgeHook,
  validateJournalHook,
  registerDefaultHooks,
};
