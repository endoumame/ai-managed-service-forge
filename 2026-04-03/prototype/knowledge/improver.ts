/**
 * ナレッジ自動改善ループ
 *
 * なぜ自動改善が重要か:
 * AIマネージドサービスの核心は「使うほど賢くなる」こと。
 * 人間の修正をフィードバックとして蓄積し、一定条件を満たしたら
 * 「確定ルール」に昇格する仕組みが、内製との差別化ポイントになる。
 *
 * 確定ルール昇格の流れ:
 * 1. 人間が消込を承認 → 辞書に記録（usageCount++）
 * 2. usageCount >= PROMOTION_THRESHOLD → 昇格提案を生成
 * 3. 経理担当者が提案を承認 → isPromoted = true に更新
 * 4. 以降、この名義パターンはAIを経由せず決定論的に処理される
 */

import type { ImprovementProposal, KnowledgeEntry } from "../types.ts";

/** 確定ルール昇格の閾値（同一パターンがN回以上使われたら提案） */
const PROMOTION_THRESHOLD = 3;

/**
 * ナレッジ辞書を分析し、改善提案を生成する
 *
 * ハーネスから呼ばれ、結果はヒューマン・イン・ザ・ループの承認キューに入る。
 * AIが自動で確定ルールに昇格させることはない（必ず人間の承認が必要）。
 */
const generateImprovementProposals = (entries: KnowledgeEntry[]): ImprovementProposal[] => {
  const proposals: ImprovementProposal[] = [];

  for (const entry of entries) {
    // 未昇格かつ閾値以上の使用回数
    if (!entry.isPromoted && entry.usageCount >= PROMOTION_THRESHOLD) {
      proposals.push({
        entry,
        proposalType: "promote_to_rule",
        reason:
          `「${entry.payerNamePattern}」→「${entry.clientName}（${entry.clientCode}）」のマッピングが` +
          `${entry.usageCount}回使用されました。確定ルールに昇格すると、以降はAIを経由せず自動消込されます。`,
      });
    }
  }

  return proposals;
};

/**
 * 昇格提案を承認する（ヒューマン・イン・ザ・ループ）
 *
 * 経理担当者が承認した提案を実際に確定ルールに反映する。
 */
const approvePromotion = (entry: KnowledgeEntry, entries: KnowledgeEntry[]): KnowledgeEntry[] => {
  const target = entries.find(
    (el) => el.payerNamePattern === entry.payerNamePattern && el.clientCode === entry.clientCode,
  );
  if (target) {
    target.isPromoted = true;
  }
  return entries;
};

export { approvePromotion, generateImprovementProposals };
