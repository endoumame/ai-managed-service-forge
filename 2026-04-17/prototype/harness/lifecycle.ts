// ハーネス層: ライフサイクル管理
// AIエージェントの各処理ステップの前後にフックを挟み、品質を外部から保証する

interface HookContext {
  contractText: string;
  step: string;
  data: Record<string, unknown>;
  warnings: string[];
  errors: string[];
}

type LifecycleHook = (ctx: HookContext) => HookContext;

interface StepDefinition {
  name: string;
  before: LifecycleHook[];
  execute: (ctx: HookContext) => Promise<HookContext>;
  after: LifecycleHook[];
}

const MIN_CONTRACT_LENGTH = 50;
const SCORE_DIVERGENCE_THRESHOLD = 2;

const hasErrors = (ctx: HookContext): boolean => ctx.errors.some(Boolean);

const isClauseArray = (value: unknown): value is { quote: string; title: string }[] =>
  Array.isArray(value) &&
  value.every(
    (item) => typeof item === "object" && item !== null && "quote" in item && "title" in item,
  );

const isRecord = (value: unknown): value is Record<string, number> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// Before:analyze - 入力検証
const validateInput: LifecycleHook = (ctx) => {
  if (!ctx.contractText || ctx.contractText.trim().length < MIN_CONTRACT_LENGTH) {
    ctx.errors.push("契約書テキストが短すぎます（最低50文字必要）");
  }
  return ctx;
};

// After:extract-clauses - AIが抽出した条項が原文に実在するか検証
const verifyClauseExistence: LifecycleHook = (ctx) => {
  const raw = ctx.data["extractedClauses"];
  if (!isClauseArray(raw)) {
    return ctx;
  }

  const normalizedText = ctx.contractText.replaceAll(/\s+/g, "");
  for (const clause of raw.filter((cl) => cl.quote)) {
    if (!normalizedText.includes(clause.quote.replaceAll(/\s+/g, ""))) {
      ctx.warnings.push(
        `引用検証失敗: "${clause.title}" の引用が原文に見つかりません（ハルシネーションの可能性）`,
      );
    }
  }
  return ctx;
};

// After:risk-score - AIスコアと決定論的スコアの乖離チェック
const verifyScoreConsistency: LifecycleHook = (ctx) => {
  const aiScores = ctx.data["aiRiskScores"];
  const deterministicScores = ctx.data["deterministicRiskScores"];
  if (!isRecord(aiScores) || !isRecord(deterministicScores)) {
    return ctx;
  }

  for (const [key, aiScore] of Object.entries(aiScores)) {
    const detScore = deterministicScores[key];
    if (
      typeof detScore === "number" &&
      Math.abs(aiScore - detScore) >= SCORE_DIVERGENCE_THRESHOLD
    ) {
      ctx.warnings.push(
        `スコア乖離検出: "${key}" - AI=${aiScore}, ルール=${detScore}（差≧2 → 要確認）`,
      );
    }
  }
  return ctx;
};

const applyHooks = (hooks: LifecycleHook[], ctx: HookContext): HookContext => {
  let result = ctx;
  for (const hook of hooks) {
    result = hook(result);
  }
  return result;
};

type Logger = (message: string) => void;

// eslint-disable-next-line no-console -- CLIプロトタイプのため標準出力を使用
const writeStdout = globalThis.console.log.bind(globalThis.console);
const defaultLogger: Logger = (message) => {
  writeStdout(message);
};

const executeStep = async (
  step: StepDefinition,
  ctx: HookContext,
  log: Logger,
): Promise<HookContext> => {
  log(`\n── ステップ: ${step.name} ──`);
  const beforeCtx = applyHooks(step.before, { ...ctx, step: step.name });
  if (hasErrors(beforeCtx)) {
    for (const err of beforeCtx.errors) {
      log(`  ✗ ${err}`);
    }
    return beforeCtx;
  }

  const afterCtx = applyHooks(step.after, await step.execute(beforeCtx));
  for (const warn of afterCtx.warnings) {
    log(`  ⚠ ${warn}`);
  }
  return afterCtx;
};

// パイプライン実行エンジン - ステップは前のコンテキストに依存するため逐次実行が必須
const runPipeline = async (
  steps: StepDefinition[],
  initialCtx: HookContext,
  log: Logger = defaultLogger,
): Promise<HookContext> => {
  let ctx = { ...initialCtx };
  for (const step of steps) {
    if (hasErrors(ctx)) {
      break;
    }
    // oxlint-disable-next-line no-await-in-loop -- ステップは前のコンテキストに依存するため並列化不可
    ctx = await executeStep(step, ctx, log);
  }
  return ctx;
};

export {
  type HookContext,
  type LifecycleHook,
  type StepDefinition,
  validateInput,
  verifyClauseExistence,
  verifyScoreConsistency,
  runPipeline,
};
