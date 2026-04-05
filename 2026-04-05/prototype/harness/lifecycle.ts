/**
 * Harness/lifecycle.ts — ライフサイクルフック管理
 *
 * なぜこの実装か:
 * AIエージェントの各処理ステップの前後にフックを挟むことで、
 * AIの出力を「信頼しない」アーキテクチャを実現する。
 * フックは決定論的な検証ロジックであり、AIの自己申告に依存しない。
 */

// フックの型定義: 検証結果を返す関数
type HookFn<TData> = (data: TData) => HookResult;

interface HookResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

// ライフサイクルイベント名
type LifecycleEvent = "before-extract" | "after-extract" | "before-journalize" | "after-journalize";

// フック登録を管理するレジストリ
// Map<イベント名, フック関数の配列> で複数フックを1イベントに登録可能
const hookRegistry = new Map<string, HookFn<unknown>[]>();

/**
 * フックを登録する
 * 同一イベントに複数のフックを登録でき、全て順番に実行される
 */
const registerHook = (event: LifecycleEvent, hook: HookFn<unknown>): void => {
  const hooks = hookRegistry.get(event) ?? [];
  hooks.push(hook);
  hookRegistry.set(event, hooks);
};

/**
 * 指定イベントの全フックを実行し、結果を集約する
 *
 * 全フックが passed: true を返した場合のみ、集約結果も passed: true となる。
 * これにより「1つでも検証に失敗したら処理を止める」ことがハーネスレベルで保証される。
 */
const runHooks = <TData>(event: LifecycleEvent, data: TData): HookResult => {
  const hooks = hookRegistry.get(event) ?? [];
  const aggregated: HookResult = { errors: [], passed: true, warnings: [] };

  for (const hook of hooks) {
    const result = hook(data);
    if (!result.passed) {
      aggregated.passed = false;
    }
    aggregated.errors.push(...result.errors);
    aggregated.warnings.push(...result.warnings);
  }

  return aggregated;
};

/**
 * 登録済みフックをすべてクリアする（テスト用）
 */
const clearHooks = (): void => {
  hookRegistry.clear();
};

export { clearHooks, registerHook, runHooks };
export type { HookFn, HookResult, LifecycleEvent };
