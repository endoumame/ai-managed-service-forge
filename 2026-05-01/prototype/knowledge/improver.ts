import type { AccountMapping, CorrectionRecord, KnowledgeBase } from "../types.ts";
import { shouldPromoteToRule, upsertMapping } from "./store.ts";

// oxlint-disable eslint(no-magic-numbers) -- 初期使用回数の定義に必要

// 自動改善ループ: 人間の修正フィードバックからナレッジを更新する
// AIマネージドサービスの核心 — 使うほど賢くなる仕組み

interface ImprovementProposal {
  type: "new_mapping" | "update_mapping" | "promote_to_rule";
  description: string;
  mapping: AccountMapping;
}

interface CorrectionInput {
  invoiceId: string;
  vendorName: string;
  originalAccountCode: string;
  correctedAccountCode: string;
  correctedAccountName: string;
  itemDescription: string;
}

const buildMappingFromCorrection = (correction: CorrectionRecord): AccountMapping => ({
  accountCode: correction.correctedAccountCode,
  accountName: correction.correctedAccountName,
  itemPattern: correction.itemDescription,
  source: "ai_learned",
  usageCount: 1,
  vendorName: correction.vendorName,
});

const analyzeCorrection = (
  kb: KnowledgeBase,
  correction: CorrectionRecord,
): ImprovementProposal => {
  const existing = kb.accountMappings.find(
    (mp) =>
      mp.vendorName === correction.vendorName && mp.itemPattern === correction.itemDescription,
  );

  // oxlint-disable-next-line typescript-eslint(strict-boolean-expressions)
  if (!existing) {
    return {
      description: `新規マッピング追加: ${correction.vendorName} / ${correction.itemDescription} → ${correction.correctedAccountCode} ${correction.correctedAccountName}`,
      mapping: buildMappingFromCorrection(correction),
      type: "new_mapping",
    };
  }

  const updatedMapping: AccountMapping = {
    ...existing,
    accountCode: correction.correctedAccountCode,
    accountName: correction.correctedAccountName,
    usageCount: existing.usageCount + 1,
  };

  if (shouldPromoteToRule(updatedMapping)) {
    return {
      description: `ルール昇格: ${correction.vendorName} / ${correction.itemDescription} は${updatedMapping.usageCount}回使用され、決定論的ルールに昇格します`,
      mapping: { ...updatedMapping, source: "rule_promoted" },
      type: "promote_to_rule",
    };
  }

  return {
    description: `マッピング更新: ${correction.vendorName} / ${correction.itemDescription} の勘定科目を ${correction.correctedAccountCode} に更新（使用回数: ${updatedMapping.usageCount}）`,
    mapping: updatedMapping,
    type: "update_mapping",
  };
};

const applyProposal = (kb: KnowledgeBase, proposal: ImprovementProposal): KnowledgeBase =>
  upsertMapping(kb, proposal.mapping);

const generateCorrectionRecord = (input: CorrectionInput): CorrectionRecord => ({
  correctedAccountCode: input.correctedAccountCode,
  correctedAccountName: input.correctedAccountName,
  invoiceId: input.invoiceId,
  itemDescription: input.itemDescription,
  originalAccountCode: input.originalAccountCode,
  timestamp: new Date().toISOString(),
  vendorName: input.vendorName,
});

export { analyzeCorrection, applyProposal, generateCorrectionRecord };
export type { CorrectionInput, ImprovementProposal };
