/**
 * ハーネス層: ライフサイクル管理
 *
 * パイプラインの各ステップ前後にフックを実行し、
 * 品質チェックを強制する。AIに自己完了を宣言させず、
 * 外部からバリデーションを挟むことでドリフトを防止する。
 */
import type { ChecklistItem, ExtractedData, StepResult } from "../types.ts";

type HookFn<TData> = (data: TData) => ChecklistItem[];
type LogFn = (message: string) => void;

interface LifecycleHooks {
  afterClassify: HookFn<ExtractedData>;
  afterExtract: HookFn<ExtractedData>;
}

interface StepConfig<TInput, TOutput> {
  afterHook: HookFn<TOutput>;
  executor: (input: TInput) => TOutput;
  input: TInput;
  log?: LogFn;
  stepName: string;
}

const EMPTY_COUNT = 0;
const REPEAT_COUNT = 3;

/** フック実行結果からStepResultを構築する */
const runHook = <TData>(hookName: string, data: TData, hook: HookFn<TData>): StepResult<TData> => {
  const checklist = hook(data);
  const errors = checklist
    .filter((item) => !item.passed)
    .map((item) => `[${hookName}] ${item.label}: ${item.detail ?? "失敗"}`);
  const warnings = checklist
    .filter((item) => item.passed && item.detail?.includes("警告") === true)
    .map((item) => `[${hookName}] ${item.label}: ${item.detail ?? ""}`);

  return {
    checklist,
    data,
    errors,
    success: errors.length === EMPTY_COUNT,
    warnings,
  };
};

// eslint-disable-next-line no-empty-function -- intentional no-op for optional logging
const noopLog: LogFn = () => {};

const logStepResult = <TData>(stepName: string, result: StepResult<TData>, log: LogFn): void => {
  const status = result.success ? "PASS" : "FAIL";
  log(`\n[${"=".repeat(REPEAT_COUNT)} ${stepName} ${status} ${"=".repeat(REPEAT_COUNT)}]`);
  for (const item of result.checklist) {
    const icon = item.passed ? "[ok]" : "[NG]";
    log(`  ${icon} ${item.label}: ${item.detail ?? ""}`);
  }
  for (const warn of result.warnings) {
    log(`  [!] ${warn}`);
  }
};

/** パイプラインステップを実行し、フック結果を返す */
const executeStep = <TInput, TOutput>(config: StepConfig<TInput, TOutput>): StepResult<TOutput> => {
  const output = config.executor(config.input);
  const result = runHook(config.stepName, output, config.afterHook);
  logStepResult(config.stepName, result, config.log ?? noopLog);
  return result;
};

export type { HookFn, LifecycleHooks, LogFn, StepConfig };
export { executeStep, noopLog, runHook };
