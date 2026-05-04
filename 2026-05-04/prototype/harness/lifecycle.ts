import type { HookFn, HookPhase, PipelineContext } from "../types.ts";
import { logger } from "../logger.ts";

const EMPTY = 0;
const STEP = 1;

interface HookChainState {
  hooks: HookFn[];
  index: number;
  context: PipelineContext;
}

const hasErrors = (ctx: PipelineContext): boolean => ctx.validationErrors.length > EMPTY;

const runNextHook = async (state: HookChainState, phase: HookPhase): Promise<PipelineContext> => {
  if (state.index >= state.hooks.length) {
    return state.context;
  }
  const hook = state.hooks[state.index];
  const result = await hook(state.context);
  if (hasErrors(result)) {
    logger.error(`バリデーションエラー検出 @ ${phase}:`);
    for (const err of result.validationErrors) {
      logger.error(`  - ${err}`);
    }
    return result;
  }
  return runNextHook({ ...state, context: result, index: state.index + STEP }, phase);
};

class LifecycleManager {
  private hooks = new Map<HookPhase, HookFn[]>();

  registerHook(phase: HookPhase, fn: HookFn): void {
    const existing = this.hooks.get(phase) ?? [];
    existing.push(fn);
    this.hooks.set(phase, existing);
  }

  async executePhase(phase: HookPhase, context: PipelineContext): Promise<PipelineContext> {
    logger.step(`${phase} フェーズ開始`);
    const hooks = this.hooks.get(phase) ?? [];
    const result = await runNextHook({ context, hooks, index: 0 }, phase);
    for (const warning of result.warnings) {
      logger.warn(warning);
    }
    logger.step(`${phase} フェーズ完了`);
    return result;
  }
}

export { LifecycleManager };
