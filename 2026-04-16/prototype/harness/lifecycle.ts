// ハーネス層: ライフサイクルフック管理
// AIエージェントの各アクション前後に決定論的チェックを挟み、ドリフトを防止する

type HookPhase = "before" | "after";
type HookAction = "scan" | "triage" | "fix";
type HookName = `${HookPhase}:${HookAction}`;

interface HookContext {
  action: HookAction;
  phase: HookPhase;
  data: Record<string, unknown>;
  warnings: string[];
  errors: string[];
}

type HookHandler = (ctx: HookContext) => HookContext;

const EMPTY = 0;
const CONFIDENCE_THRESHOLD = 0.7;

const hooks = new Map<HookName, HookHandler[]>();

const hasStringProp = (obj: Record<string, unknown>, key: string): boolean =>
  key in obj && typeof obj[key] === "string";

const hasNumberProp = (obj: Record<string, unknown>, key: string): boolean =>
  key in obj && typeof obj[key] === "number";

const getStr = (obj: Record<string, unknown>, key: string): string => String(obj[key]);

const getNum = (obj: Record<string, unknown>, key: string): number => Number(obj[key]);

const registerHook = (name: HookName, handler: HookHandler): void => {
  const existing = hooks.get(name) ?? [];
  existing.push(handler);
  hooks.set(name, existing);
};

const executeHooks = (
  action: HookAction,
  phase: HookPhase,
  data: Record<string, unknown>,
): HookContext => {
  const name: HookName = `${phase}:${action}`;
  const ctx: HookContext = { action, data, errors: [], phase, warnings: [] };

  const handlers = hooks.get(name) ?? [];
  let current = ctx;
  for (const handler of handlers) {
    if (current.errors.length > EMPTY) {
      break;
    }
    current = handler(current);
  }
  return current;
};

const scanInputHook: HookHandler = (ctx) => {
  const { packageJson } = ctx.data;
  if (typeof packageJson !== "object" || packageJson === null) {
    ctx.errors.push("packageJson is required for scanning");
  }
  return ctx;
};

const scanOutputHook: HookHandler = (ctx) => {
  const { vulnerabilities } = ctx.data;
  if (!Array.isArray(vulnerabilities)) {
    ctx.errors.push("scan must produce a vulnerabilities array");
    return ctx;
  }
  if (vulnerabilities.length === EMPTY) {
    ctx.warnings.push("No vulnerabilities found — verify scan coverage is complete");
  }
  return ctx;
};

const isValidTriageEntry = (entry: unknown): entry is object =>
  typeof entry === "object" &&
  entry !== null &&
  hasStringProp(entry, "severity") &&
  hasStringProp(entry, "impact") &&
  hasNumberProp(entry, "confidence");

const collectTriageWarnings = (entry: object): string[] => {
  const warnings: string[] = [];
  const severity = getStr(entry, "severity");
  const impact = getStr(entry, "impact");
  const confidence = getNum(entry, "confidence");
  if (severity === "CRITICAL" && impact === "none") {
    warnings.push(
      `Sanity check: Critical vulnerability marked as no-impact — requires human review`,
    );
  }
  if (confidence < CONFIDENCE_THRESHOLD) {
    warnings.push(`Low confidence triage (${String(confidence)}) — escalating to human review`);
  }
  return warnings;
};

// ドリフト対策の核心: AIトリアージ結果のサニティチェック
const triageOutputHook: HookHandler = (ctx) => {
  const raw = ctx.data["triageResults"];
  if (!Array.isArray(raw)) {
    return ctx;
  }
  for (const entry of raw) {
    if (isValidTriageEntry(entry)) {
      ctx.warnings.push(...collectTriageWarnings(entry));
    }
  }
  return ctx;
};

const registerDefaultHooks = (): void => {
  registerHook("before:scan", scanInputHook);
  registerHook("after:scan", scanOutputHook);
  registerHook("after:triage", triageOutputHook);
};

export {
  executeHooks,
  registerDefaultHooks,
  registerHook,
  type HookAction,
  type HookContext,
  type HookName,
  type HookPhase,
};
