import type { AccountMapping, CorrectionRecord, KnowledgeBase } from "../types.ts";

// oxlint-disable eslint(no-magic-numbers) -- 初期値と閾値の定義に必要

// ナレッジストア: 学習データの永続化を担当する
// インメモリ実装（プロトタイプ用）、シリアライズ/デシリアライズ機能付き

const RULE_PROMOTION_THRESHOLD = 3;

const createEmptyKnowledgeBase = (): KnowledgeBase => ({
  accountMappings: [],
  correctionHistory: [],
  processedCount: 0,
});

let currentKnowledgeBase: KnowledgeBase = createEmptyKnowledgeBase();

const load = (): KnowledgeBase => currentKnowledgeBase;

const save = (kb: KnowledgeBase): void => {
  currentKnowledgeBase = kb;
};

const serialize = (kb: KnowledgeBase): string => JSON.stringify(kb, null, 2);

// oxlint-disable-next-line typescript-eslint(no-unsafe-type-assertion) -- プロトタイプ用の簡易デシリアライズ
const deserialize = (json: string): KnowledgeBase => JSON.parse(json) as KnowledgeBase;

const findMapping = (
  kb: KnowledgeBase,
  vendorName: string,
  itemPattern: string,
): AccountMapping | null => {
  const found = kb.accountMappings.find(
    (mp) => mp.vendorName === vendorName && mp.itemPattern === itemPattern,
  );
  return found ?? null;
};

const upsertMapping = (kb: KnowledgeBase, mapping: AccountMapping): KnowledgeBase => {
  const idx = kb.accountMappings.findIndex(
    (mp) => mp.vendorName === mapping.vendorName && mp.itemPattern === mapping.itemPattern,
  );

  if (idx !== -1) {
    const updatedMappings = [...kb.accountMappings];
    updatedMappings[idx] = mapping;
    return { ...kb, accountMappings: updatedMappings };
  }

  return { ...kb, accountMappings: [...kb.accountMappings, mapping] };
};

const addCorrection = (kb: KnowledgeBase, correction: CorrectionRecord): KnowledgeBase => ({
  ...kb,
  correctionHistory: [...kb.correctionHistory, correction],
});

const incrementProcessedCount = (kb: KnowledgeBase): KnowledgeBase => ({
  ...kb,
  processedCount: kb.processedCount + 1,
});

const shouldPromoteToRule = (mapping: AccountMapping): boolean =>
  mapping.source === "ai_learned" && mapping.usageCount >= RULE_PROMOTION_THRESHOLD;

export {
  addCorrection,
  createEmptyKnowledgeBase,
  deserialize,
  findMapping,
  incrementProcessedCount,
  load,
  save,
  serialize,
  shouldPromoteToRule,
  upsertMapping,
};
