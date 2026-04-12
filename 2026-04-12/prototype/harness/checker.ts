/**
 * ContractShield ハーネス層 - 品質チェッカー
 *
 * なぜ品質チェックをハーネスが担うか:
 * AIエージェントに自己評価させると「品質の自己過信」が発生する。
 * ハーネスが外部から客観的に品質を検証することで、
 * AIのドリフトを検出し、人間レビューへのエスカレーションを判断する。
 */

import type { ClauseAnalysis, ClauseCategory, Contract } from "../types.ts";
import { REQUIRED_CATEGORIES } from "../types.ts";

const CONFIDENCE_THRESHOLD = 0.7;
const DECIMAL_PLACES = 2;
const NONE_COUNT = 0;

interface QualityCheckResult {
  passed: boolean;
  issues: string[];
}

/** 必須カテゴリが全て分析されているか検証する */
const checkRequiredCoverage = (contract: Contract): QualityCheckResult => {
  const presentCategories = new Set(contract.clauses.map((cl) => cl.category));
  const missing = REQUIRED_CATEGORIES.filter((cat) => !presentCategories.has(cat));

  return {
    issues: missing.map((cat: ClauseCategory) => `必須カテゴリ「${cat}」の条項が見つかりません`),
    passed: missing.length === NONE_COUNT,
  };
};

/** AIの確信度が低い分析がないか検証する */
const checkConfidenceLevels = (analyses: ClauseAnalysis[]): QualityCheckResult => {
  const lowConfidence = analyses.filter((an) => an.confidence < CONFIDENCE_THRESHOLD);

  return {
    issues: lowConfidence.map(
      (an) => `条項${an.clauseId}の確信度が低い (${an.confidence.toFixed(DECIMAL_PLACES)})`,
    ),
    passed: lowConfidence.length === NONE_COUNT,
  };
};

/** 全ての品質チェックを実行する */
const runAllChecks = (contract: Contract, analyses: ClauseAnalysis[]): QualityCheckResult => {
  const coverageResult = checkRequiredCoverage(contract);
  const confidenceResult = checkConfidenceLevels(analyses);

  const allIssues = [...coverageResult.issues, ...confidenceResult.issues];

  return {
    issues: allIssues,
    passed: coverageResult.passed && confidenceResult.passed,
  };
};

export { checkConfidenceLevels, checkRequiredCoverage, runAllChecks };
export type { QualityCheckResult };
