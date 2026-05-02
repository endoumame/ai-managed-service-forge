/**
 * ナレッジ管理: 自動改善ループ
 *
 * ユーザーの仕訳修正を検知し、ナレッジルールの更新提案を生成する。
 * 提案は自動適用せず、必ずヒューマン・イン・ザ・ループを経由する。
 */
import type { KnowledgeBase, PendingUpdate } from "./store.ts";
import type { KnowledgeRule, KnowledgeUpdate } from "../types.ts";

const DATE_PART_INDEX = 0;
const INITIAL_USAGE = 1;
const LEARNED_CONFIDENCE = 0.85;
const ID_PAD_LENGTH = 3;

interface CorrectionInput {
  correctedAccount: string;
  itemDescription: string;
  originalAccount: string;
  vendor: string;
}

/** 仕訳修正からナレッジ更新提案を生成する */
const proposeUpdates = (kb: KnowledgeBase, correction: CorrectionInput): KnowledgeUpdate[] => {
  const updates: KnowledgeUpdate[] = [];
  const { correctedAccount, itemDescription, originalAccount, vendor } = correction;

  if (originalAccount === correctedAccount) {
    return updates;
  }

  const existingRule = kb.rules.find(
    (rule) => rule.vendor === vendor && itemDescription.includes(rule.pattern),
  );

  if (existingRule) {
    if (existingRule.account !== correctedAccount) {
      updates.push({
        description: `${vendor}の「${itemDescription}」の勘定科目を「${existingRule.account}」から「${correctedAccount}」に変更`,
        proposedMapping: {
          account: correctedAccount,
          pattern: existingRule.pattern,
        },
        reason: `ユーザーが仕訳を修正: ${originalAccount} → ${correctedAccount}`,
        type: "flag_conflict",
        vendor,
      });
    }
  } else {
    updates.push({
      description: `${vendor}の「${itemDescription}」を「${correctedAccount}」に分類するルールを新規追加`,
      proposedMapping: {
        account: correctedAccount,
        pattern: itemDescription,
      },
      reason: `新規パターン検出: ユーザーが「${correctedAccount}」を選択`,
      type: "new_rule",
      vendor,
    });
  }

  return updates;
};

/** 承認された更新をナレッジベースに反映する */
const applyApprovedUpdate = (kb: KnowledgeBase, update: KnowledgeUpdate): KnowledgeBase => {
  const now = new Date().toISOString().split("T")[DATE_PART_INDEX];

  if (update.type === "new_rule") {
    const newRule: KnowledgeRule = {
      account: update.proposedMapping.account,
      confidence: LEARNED_CONFIDENCE,
      id: `rule-${String(kb.rules.length + INITIAL_USAGE).padStart(ID_PAD_LENGTH, "0")}`,
      lastUsed: now,
      pattern: update.proposedMapping.pattern,
      source: "learned",
      usageCount: INITIAL_USAGE,
      vendor: update.vendor,
    };
    return { ...kb, rules: [...kb.rules, newRule] };
  }

  if (update.type === "flag_conflict" || update.type === "update_rule") {
    const updatedRules = kb.rules.map((rule) => {
      if (rule.vendor === update.vendor && rule.pattern === update.proposedMapping.pattern) {
        return { ...rule, account: update.proposedMapping.account, lastUsed: now };
      }
      return rule;
    });
    return { ...kb, rules: updatedRules };
  }

  return kb;
};

/** 未処理の更新提案をキューに追加する */
const queuePendingUpdate = (kb: KnowledgeBase, update: KnowledgeUpdate): KnowledgeBase => {
  const pending: PendingUpdate = {
    account: update.proposedMapping.account,
    pattern: update.proposedMapping.pattern,
    reason: update.reason,
    timestamp: new Date().toISOString(),
    vendor: update.vendor,
  };
  return {
    ...kb,
    pendingUpdates: [...kb.pendingUpdates, pending],
  };
};

export type { CorrectionInput };
export { applyApprovedUpdate, proposeUpdates, queuePendingUpdate };
