/**
 * ナレッジストア — 仕訳ルールのインメモリ管理と検索
 *
 * なぜインメモリか:
 * プラットフォーム非依存にするため、Node.js組み込みモジュールに依存しない。
 * シリアライズ/デシリアライズはJSON文字列の入出力で行い、
 * 実際のファイル永続化はデモ層（demo/run.ts）に委譲する。
 */

import type { ClassificationRule, ImprovementProposal } from "../types.ts";

/** ナレッジストアのデータ構造 */
interface KnowledgeData {
  rules: ClassificationRule[];
  proposals: ImprovementProposal[];
  history: FeedbackRecord[];
}

/** ユーザーフィードバックの記録 */
interface FeedbackRecord {
  invoiceId: string;
  vendor: string;
  originalAccountCode: string;
  originalAccountName: string;
  finalAccountCode: string;
  finalAccountName: string;
  action: "approved" | "modified" | "rejected";
  timestamp: string;
}

/** 承認率が低下したとみなす閾値 */
const LOW_APPROVAL_RATE = 0.8;

/** ルール改善提案を検討する最小使用回数 */
const MIN_USAGE_FOR_REVIEW = 3;

/** 承認時のフィードバック値（移動平均計算用） */
const APPROVAL_FEEDBACK_VALUE = 1;

/** パーセント変換用の乗数 */
const PERCENT_MULTIPLIER = 100;

/** JSONシリアライズのインデント幅 */
const JSON_INDENT = 2;

/** 配列の先頭インデックス */
const FIRST_INDEX = 0;

/** FindIndex の「見つからなかった」戻り値 */
const NOT_FOUND = -1;

/** ToFixed の小数桁数（パーセント表示用） */
const FIXED_DIGITS = 0;

const createEmptyData = (): KnowledgeData => ({
  history: [],
  proposals: [],
  rules: [],
});

/** KnowledgeData型のガード関数 */
const isKnowledgeData = (value: unknown): value is KnowledgeData => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return "rules" in value && "proposals" in value && "history" in value;
};

/** JSON文字列からナレッジデータを復元 */
const deserialize = (json: string): KnowledgeData => {
  if (json === "") {
    return createEmptyData();
  }
  const parsed: unknown = JSON.parse(json);
  if (isKnowledgeData(parsed)) {
    return parsed;
  }
  return createEmptyData();
};

/** ナレッジデータをJSON文字列にシリアライズ */
const serialize = (data: KnowledgeData): string => JSON.stringify(data, null, JSON_INDENT);

/** パーセント文字列を生成するヘルパー */
const toPercentString = (rate: number): string => (rate * PERCENT_MULTIPLIER).toFixed(FIXED_DIGITS);

/** 承認率低下によるルール見直し提案を生成 */
const generateDeprecateProposal = (rule: ClassificationRule): ImprovementProposal => ({
  currentRule: rule,
  description: `${rule.vendor} の仕訳ルール ${rule.accountName}(${rule.accountCode}) の承認率が ${toPercentString(rule.approvalRate)}% に低下。見直しを推奨`,
  evidence: `使用回数: ${rule.usageCount}回, 承認率: ${toPercentString(rule.approvalRate)}%`,
  id: `PROP-${Date.now()}`,
  status: "pending",
  type: "deprecate_rule",
});

/** 新規ルール追加の改善提案を生成 */
const generateProposal = (
  data: KnowledgeData,
  feedback: FeedbackRecord,
  existingRule: ClassificationRule | null,
): ImprovementProposal | null => {
  const alreadyProposed = data.proposals.some(
    (prop) =>
      prop.proposedRule?.vendor === feedback.vendor &&
      prop.proposedRule.accountCode === feedback.finalAccountCode &&
      prop.status === "pending",
  );
  if (alreadyProposed) {
    return null;
  }

  const proposedRule: ClassificationRule = {
    accountCode: feedback.finalAccountCode,
    accountName: feedback.finalAccountName,
    approvalRate: APPROVAL_FEEDBACK_VALUE,
    descriptionPattern: "",
    lastUsed: feedback.timestamp,
    usageCount: APPROVAL_FEEDBACK_VALUE,
    vendor: feedback.vendor,
  };

  return {
    currentRule: existingRule ?? proposedRule,
    description: `${feedback.vendor} の仕訳を ${feedback.originalAccountName}(${feedback.originalAccountCode}) から ${feedback.finalAccountName}(${feedback.finalAccountCode}) に変更する提案`,
    evidence: `直近のフィードバックで ${feedback.originalAccountName} から ${feedback.finalAccountName} への修正が行われました`,
    id: `PROP-${Date.now()}`,
    proposedRule,
    status: "pending",
    type: existingRule ? "update_rule" : "new_rule",
  };
};

/**
 * 取引先と摘要パターンから最適な仕訳ルールを検索
 * 承認率の高いルールを優先的に返す
 */
const findMatchingRule = (
  rules: ClassificationRule[],
  vendor: string,
  description: string,
): ClassificationRule | null => {
  const vendorRules = rules.filter((rule) => rule.vendor === vendor);
  if (vendorRules.length === FIRST_INDEX) {
    return null;
  }

  const matched = vendorRules.find((rule) => description.includes(rule.descriptionPattern));
  return matched ?? vendorRules[FIRST_INDEX] ?? null;
};

/** 既存ルールの承認率を更新 */
const updateRuleApproval = (rule: ClassificationRule, action: string): void => {
  rule.usageCount += APPROVAL_FEEDBACK_VALUE;

  if (action === "approved") {
    rule.approvalRate =
      (rule.approvalRate * (rule.usageCount - APPROVAL_FEEDBACK_VALUE) + APPROVAL_FEEDBACK_VALUE) /
      rule.usageCount;
  } else if (action === "modified") {
    rule.approvalRate =
      (rule.approvalRate * (rule.usageCount - APPROVAL_FEEDBACK_VALUE)) / rule.usageCount;
  }
};

/** 既存ルールを検索して承認率を更新 */
const findAndUpdateRule = (
  data: KnowledgeData,
  feedback: FeedbackRecord,
): ClassificationRule | null => {
  const existingRule =
    data.rules.find(
      (rule) =>
        rule.vendor === feedback.vendor && rule.accountCode === feedback.originalAccountCode,
    ) ?? null;

  if (existingRule) {
    existingRule.lastUsed = feedback.timestamp;
    updateRuleApproval(existingRule, feedback.action);
  }
  return existingRule;
};

/** 修正フィードバックから改善提案を生成してデータに追加 */
const handleModification = (
  data: KnowledgeData,
  feedback: FeedbackRecord,
  existingRule: ClassificationRule | null,
): ImprovementProposal | null => {
  if (feedback.action !== "modified") {
    return null;
  }
  const proposal = generateProposal(data, feedback, existingRule);
  if (proposal) {
    data.proposals.push(proposal);
  }
  return proposal;
};

/** 承認率低下ルールの見直し提案を追加 */
const checkLowApprovalRules = (data: KnowledgeData, rule: ClassificationRule | null): void => {
  if (rule && rule.usageCount >= MIN_USAGE_FOR_REVIEW && rule.approvalRate < LOW_APPROVAL_RATE) {
    data.proposals.push(generateDeprecateProposal(rule));
  }
};

/**
 * フィードバックを記録し、ルールを更新
 * 承認ならusageCountとapprovalRateを更新、修正なら新ルール候補を生成
 */
const recordFeedback = (
  data: KnowledgeData,
  feedback: FeedbackRecord,
): ImprovementProposal | null => {
  data.history.push(feedback);
  const existingRule = findAndUpdateRule(data, feedback);
  const proposal = handleModification(data, feedback, existingRule);
  checkLowApprovalRules(data, existingRule);
  return proposal;
};

/** 提案を承認してルールに反映 */
const approveProposal = (data: KnowledgeData, proposalId: string): boolean => {
  const proposal = data.proposals.find((prop) => prop.id === proposalId) ?? null;
  if (proposal === null || proposal.status !== "pending") {
    return false;
  }

  proposal.status = "approved";

  if (proposal.type === "new_rule" && proposal.proposedRule) {
    data.rules.push(proposal.proposedRule);
  } else if (proposal.type === "update_rule" && proposal.proposedRule && proposal.currentRule) {
    const ruleIndex = data.rules.findIndex(
      (rule) =>
        rule.vendor === proposal.currentRule?.vendor &&
        rule.accountCode === proposal.currentRule.accountCode,
    );
    if (ruleIndex !== NOT_FOUND) {
      data.rules[ruleIndex] = proposal.proposedRule;
    }
  }

  return true;
};

/** 初期ルールデータの登録 */
const initializeRules = (data: KnowledgeData, rules: ClassificationRule[]): void => {
  data.rules = rules;
};

export {
  approveProposal,
  createEmptyData,
  deserialize,
  findMatchingRule,
  initializeRules,
  recordFeedback,
  serialize,
};

export type { FeedbackRecord, KnowledgeData };
