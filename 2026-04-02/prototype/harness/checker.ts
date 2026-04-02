/**
 * ハーネス層: 品質チェック
 *
 * なぜ品質チェックをハーネスに置くか:
 * AIエージェントに「自分の出力品質を評価して」と頼むと、
 * ほぼ確実に「良好です」と返答する（品質の自己過信問題）。
 * ハーネスが決定論的なルールで品質を判定することで、
 * AIのバイアスを排除する。
 */

import type { CompletionChecklist, PipelineResult } from "./types.js";

/** 確信度の閾値（これ未満ならヒューマンレビューが必要） */
const CONFIDENCE_THRESHOLD = 0.8;
const EMPTY_COUNT = 0;

/** チェックリストの全項目がパスしているか判定する */
const isChecklistComplete = (checklist: CompletionChecklist): boolean =>
  checklist.allRequiredFieldsExtracted &&
  checklist.accountCodesValid &&
  checklist.taxCalculationMatches &&
  checklist.duplicateCheckDone &&
  checklist.anomalyCheckDone;

/** ヒューマンレビューが必要かどうかを判定する */
const determineHumanReview = (
  result: PipelineResult,
  confidence: number,
): { required: boolean; reasons: string[] } => {
  const reasons: string[] = [];

  if (confidence < CONFIDENCE_THRESHOLD) {
    reasons.push(`仕訳推定の確信度が閾値未満です（${confidence} < ${CONFIDENCE_THRESHOLD}）`);
  }

  if (!isChecklistComplete(result.checklist)) {
    reasons.push("チェックリストに未完了の項目があります");
  }

  if (result.validation.errors.length > EMPTY_COUNT) {
    reasons.push(`バリデーションエラーが${result.validation.errors.length}件あります`);
  }

  if (result.validation.warnings.length > EMPTY_COUNT) {
    reasons.push(`警告が${result.validation.warnings.length}件あります（確認推奨）`);
  }

  return {
    reasons,
    required: reasons.length > EMPTY_COUNT,
  };
};

export { CONFIDENCE_THRESHOLD, determineHumanReview, isChecklistComplete };
