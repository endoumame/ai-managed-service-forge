/*
 * ハーネス層: ライフサイクルフック管理
 *
 * AIエージェントの出力を「信頼しない」設計の中核。
 * 各パイプラインステージの前後でバリデーションを実行し、
 * 品質基準を満たさない場合はパイプラインを停止する。
 *
 * ドリフト対策: AIの自己申告（「完了しました」）ではなく、
 * ハーネスが客観的条件で完了を判定する。
 */

import type {
  CheckResult,
  HookResult,
  JournalEntry,
  JournalLine,
  LifecycleHook,
  PipelineContext,
} from "../types.ts";

const CONFIDENCE_THRESHOLD = 0.8;
const BALANCE_TOLERANCE = 0.01;
const HIGH_AMOUNT_THRESHOLD = 1_000_000;
const NONE = 0;

/** レビュー要求レスポンスを生成するヘルパー */
const buildReviewResponse = (
  context: PipelineContext,
  message: string,
  reason: string,
): HookResult => ({
  messages: [message],
  modifiedContext: {
    humanReviewReasons: [...context.humanReviewReasons, reason],
    humanReviewRequired: true,
  },
  proceed: true,
});

/** 仕訳エントリの借方/貸方合計を算出 */
const sumField = (entries: JournalLine[], field: "debit" | "credit"): number =>
  entries.reduce((sum, entry) => sum + entry[field], NONE);

/** 仕訳の貸借バランスを検証 */
const checkBalance = (journal: JournalEntry): HookResult | null => {
  const totalDebit = sumField(journal.entries, "debit");
  const totalCredit = sumField(journal.entries, "credit");
  if (Math.abs(totalDebit - totalCredit) > BALANCE_TOLERANCE) {
    return {
      messages: [`[BLOCKED] 貸借不一致: 借方合計=${totalDebit}, 貸方合計=${totalCredit}`],
      proceed: false,
    };
  }
  return null;
};

/** 抽出前フック: 入力データの形式チェック */
const beforeExtract: LifecycleHook = {
  execute: (context: PipelineContext): HookResult => {
    const invoice = context.rawInvoice;
    if (invoice.items.length === NONE) {
      return { messages: ["[BLOCKED] 請求書に明細項目がありません"], proceed: false };
    }
    if (invoice.totalAmount <= NONE) {
      return { messages: ["[BLOCKED] 請求金額が0以下です"], proceed: false };
    }
    return {
      messages: [`[OK] 入力チェック通過: ${invoice.items.length}件の明細項目`],
      proceed: true,
    };
  },
  name: "beforeExtract",
  stage: "before",
  target: "extracting",
};

/** 抽出後フック: AI出力の信頼度チェック */
const afterExtract: LifecycleHook = {
  execute: (context: PipelineContext): HookResult => {
    const extracted = context.extractedData;
    if (!extracted) {
      return { messages: ["[BLOCKED] 抽出データが存在しません"], proceed: false };
    }
    if (extracted.confidence < CONFIDENCE_THRESHOLD) {
      return buildReviewResponse(
        context,
        `[REVIEW] 抽出信頼度が閾値未満: ${extracted.confidence} < ${CONFIDENCE_THRESHOLD}`,
        `抽出信頼度が低い (${extracted.confidence})`,
      );
    }
    const lowCount = extracted.items.filter(
      (item) => item.accountConfidence < CONFIDENCE_THRESHOLD,
    ).length;
    if (lowCount > NONE) {
      return buildReviewResponse(
        context,
        `[REVIEW] ${lowCount}件の明細で勘定科目の信頼度が低い`,
        `${lowCount}件の勘定科目推定の信頼度が低い`,
      );
    }
    return {
      messages: [`[OK] 抽出品質チェック通過: 信頼度 ${extracted.confidence}`],
      proceed: true,
    };
  },
  name: "afterExtract",
  stage: "after",
  target: "extracted",
};

/** 仕訳後フック: 貸借一致と金額整合性の検証 */
const afterJournalize: LifecycleHook = {
  execute: (context: PipelineContext): HookResult => {
    const journal = context.journalEntry;
    if (!journal) {
      return { messages: ["[BLOCKED] 仕訳データが存在しません"], proceed: false };
    }
    const balanceError = checkBalance(journal);
    if (balanceError) {
      return balanceError;
    }

    const totalDebit = sumField(journal.entries, "debit");
    if (context.rawInvoice.totalAmount > HIGH_AMOUNT_THRESHOLD) {
      return buildReviewResponse(
        context,
        `[OK] 貸借一致: ${totalDebit}円\n[REVIEW] 高額請求書: ${context.rawInvoice.totalAmount}円`,
        `高額請求書 (${context.rawInvoice.totalAmount}円)`,
      );
    }
    return { messages: [`[OK] 貸借一致: ${totalDebit}円`, "[OK] 金額チェック通過"], proceed: true };
  },
  name: "afterJournalize",
  stage: "after",
  target: "journalized",
};

const createLifecycleHooks = (): LifecycleHook[] => [beforeExtract, afterExtract, afterJournalize];

/** フック実行結果をCheckResultに変換するヘルパー */
const hookResultToCheckResults = (hookName: string, result: HookResult): CheckResult[] =>
  result.messages.map((msg) => ({
    message: `[${hookName}] ${msg}`,
    passed: result.proceed,
    severity: result.proceed ? ("info" as const) : ("error" as const),
  }));

/** 単一フックを実行し結果を蓄積。停止が必要ならtrueを返す */
const processSingleHook = async (
  hook: LifecycleHook,
  context: PipelineContext,
  results: CheckResult[],
): Promise<boolean> => {
  const result: HookResult = await hook.execute(context);
  results.push(...hookResultToCheckResults(hook.name, result));
  if (result.modifiedContext) {
    Object.assign(context, result.modifiedContext);
  }
  return !result.proceed;
};

/** フックリストを再帰的に順次実行（各フックが前のフックの結果に依存するため逐次実行が必須） */
const executeHooksSequentially = async (
  remaining: LifecycleHook[],
  context: PipelineContext,
  results: CheckResult[],
): Promise<boolean> => {
  if (remaining.length === NONE) {
    return false;
  }
  const [first, ...rest] = remaining;
  const stopped = await processSingleHook(first, context, results);
  if (stopped) {
    return true;
  }
  return executeHooksSequentially(rest, context, results);
};

/** 指定ステージに該当するフックを実行 */
const executeHooks = async (
  hooks: LifecycleHook[],
  stage: "before" | "after",
  opts: { target: PipelineContext["stage"]; context: PipelineContext },
): Promise<{ proceed: boolean; results: CheckResult[] }> => {
  const matchingHooks = hooks.filter((hook) => hook.stage === stage && hook.target === opts.target);
  const results: CheckResult[] = [];
  const stopped = await executeHooksSequentially(matchingHooks, opts.context, results);
  return { proceed: !stopped, results };
};

export { createLifecycleHooks, executeHooks };
