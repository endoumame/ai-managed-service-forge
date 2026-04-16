/*
 * ハーネス層: パイプラインプランナー（終了条件管理）
 *
 * パイプライン全体の進行を管理し、各ステージの
 * 遷移条件を外部的に制御する。
 * AIが「次のステップに進みます」と勝手に判断するのを防ぐ。
 */

import type {
  CheckResult,
  LifecycleHook,
  PipelineContext,
  PipelineStage,
  RawInvoice,
} from "../types.ts";
import { createChecklist, runChecklist } from "./checker.ts";
import { createLifecycleHooks, executeHooks } from "./lifecycle.ts";

/**
 * ステージ遷移マップ
 * 各ステージから次に遷移可能なステージを定義
 */
const STAGE_TRANSITIONS: Record<PipelineStage, PipelineStage | null> = {
  approved: null,
  extracted: "journalizing",
  extracting: "extracted",
  journalized: "reviewing",
  journalizing: "journalized",
  received: "extracting",
  rejected: null,
  reviewing: "approved",
};

interface PipelinePlan {
  context: PipelineContext;
  hooks: LifecycleHook[];
  checklist: ReturnType<typeof createChecklist>;
  log: string[];
}

/**
 * 新しいパイプラインプランを生成
 */
const createPlan = (invoice: RawInvoice): PipelinePlan => ({
  checklist: createChecklist(),
  context: {
    checkResults: [],
    humanReviewReasons: [],
    humanReviewRequired: false,
    invoiceId: invoice.id,
    rawInvoice: invoice,
    stage: "received",
  },
  hooks: createLifecycleHooks(),
  log: [`[PLAN] パイプライン開始: 請求書 ${invoice.id}`],
});

/**
 * ステージを遷移させる
 * フック実行→チェックリスト検証→遷移の順で実行
 * 返り値のproceedがfalseの場合、遷移は行われない
 */
const advanceStage = async (
  plan: PipelinePlan,
): Promise<{ proceed: boolean; results: CheckResult[] }> => {
  const nextStage = STAGE_TRANSITIONS[plan.context.stage];
  if (!nextStage) {
    plan.log.push(`[PLAN] パイプライン完了: ステージ=${plan.context.stage}`);
    return { proceed: false, results: [] };
  }

  plan.log.push(`[PLAN] ステージ遷移: ${plan.context.stage} → ${nextStage}`);

  const beforeResult = await executeHooks(plan.hooks, "before", {
    context: plan.context,
    target: nextStage,
  });
  plan.context.checkResults.push(...beforeResult.results);

  if (!beforeResult.proceed) {
    return { proceed: false, results: beforeResult.results };
  }

  return ((plan.context.stage = nextStage), { proceed: true, results: beforeResult.results });
};

/**
 * 現在のステージのafterフック＋チェックリストを実行
 */
const validateCurrentStage = async (
  plan: PipelinePlan,
): Promise<{ valid: boolean; results: CheckResult[] }> => {
  // After フック実行
  const afterResult = await executeHooks(plan.hooks, "after", plan.context.stage, plan.context);
  plan.context.checkResults.push(...afterResult.results);

  if (!afterResult.proceed) {
    plan.log.push("[PLAN] after フックにより検証失敗");
    return { results: afterResult.results, valid: false };
  }

  // チェックリスト実行
  const checkResult = runChecklist(plan.checklist, plan.context.stage, plan.context);
  plan.context.checkResults.push(...checkResult.results);

  if (!checkResult.allPassed) {
    plan.log.push("[PLAN] チェックリスト未充足");
  }

  return { results: checkResult.results, valid: checkResult.allPassed };
};

export { advanceStage, createPlan, validateCurrentStage };
export type { PipelinePlan };
