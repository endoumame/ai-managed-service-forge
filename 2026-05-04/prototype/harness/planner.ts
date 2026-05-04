import type { CompletionCondition, PipelineContext } from "../types.ts";
import { logger } from "../logger.ts";

const NONE = 0;

class CompletionPlanner {
  private conditions: CompletionCondition[] = [];

  addCondition(id: string, description: string, checker: (ctx: PipelineContext) => boolean): void {
    this.conditions.push({ checker, description, id, satisfied: false });
  }

  evaluate(context: PipelineContext): boolean {
    for (const condition of this.conditions) {
      condition.satisfied = condition.checker(context);
      const status = condition.satisfied ? "OK" : "NG";
      logger.info(`  [${status}] ${condition.description}`);
    }
    return this.conditions.every((cond) => cond.satisfied);
  }

  getUnsatisfied(): CompletionCondition[] {
    return this.conditions.filter((cond) => !cond.satisfied);
  }

  report(): void {
    logger.step("終了条件チェック結果");
    const unsatisfied = this.getUnsatisfied();
    if (unsatisfied.length === NONE) {
      logger.info("全条件クリア - パイプライン完了");
      return;
    }
    logger.warn(`未達条件が ${unsatisfied.length} 件あります:`);
    for (const cond of unsatisfied) {
      logger.warn(`  - ${cond.description}`);
    }
  }
}

export { CompletionPlanner };
