// ナレッジ自動改善ループ
// 人間の修正をフィードバックとして蓄積し、改善提案を生成する

import type { ExtractedData, ImprovementProposal, KnowledgeEntry } from "../types.ts";
import type { KnowledgeStore } from "./store.ts";
import { findByVendor } from "./store.ts";

const ZERO = 0;
const ONE = 1;

interface CorrectionRecord {
  invoiceId: string;
  vendorName: string;
  originalAccountCode: string;
  correctedAccountCode: string;
  correctedAccountName: string;
  itemKeywords: string[];
  timestamp: string;
}

interface ImprovementEngine {
  corrections: CorrectionRecord[];
}

const createEngine = (): ImprovementEngine => ({
  corrections: [],
});

const recordCorrection = (
  engine: ImprovementEngine,
  correction: CorrectionRecord,
): ImprovementEngine => ({
  corrections: [...engine.corrections, correction],
});

const buildNewPatternProposal = (
  vendorName: string,
  correction: CorrectionRecord,
): ImprovementProposal => ({
  after: {
    lastUsed: correction.timestamp,
    pattern: {
      accountCode: correction.correctedAccountCode,
      accountName: correction.correctedAccountName,
      itemKeywords: correction.itemKeywords,
      typicalTaxRate: 0.1,
    },
    source: "human_correction",
    usageCount: ONE,
    vendorName,
  },
  createdAt: new Date().toISOString(),
  description: `新規取引先「${vendorName}」のパターン追加: ${correction.correctedAccountName}(${correction.correctedAccountCode})`,
  evidence: [`修正記録: ${correction.invoiceId}`],
  id: `proposal-${Date.now()}`,
  status: "pending",
  type: "new_pattern",
  vendorName,
});

const buildUpdatePatternProposal = (
  existing: KnowledgeEntry,
  correction: CorrectionRecord,
): ImprovementProposal => ({
  after: {
    ...existing,
    pattern: {
      ...existing.pattern,
      accountCode: correction.correctedAccountCode,
      accountName: correction.correctedAccountName,
    },
    source: "human_correction",
  },
  before: existing,
  createdAt: new Date().toISOString(),
  description: `取引先「${existing.vendorName}」のパターン更新: ${existing.pattern.accountName} → ${correction.correctedAccountName}`,
  evidence: [`修正記録: ${correction.invoiceId}`],
  id: `proposal-${Date.now()}`,
  status: "pending",
  type: "update_pattern",
  vendorName: existing.vendorName,
});

const generateProposals = (
  engine: ImprovementEngine,
  store: KnowledgeStore,
): ImprovementProposal[] =>
  engine.corrections.map((correction) => {
    const existing = findByVendor(store, correction.vendorName);
    if (existing.length === ZERO) {
      return buildNewPatternProposal(correction.vendorName, correction);
    }
    return buildUpdatePatternProposal(existing[ZERO], correction);
  });

const buildCorrectionFromExtracted = (
  extracted: ExtractedData,
  correctedCode: string,
  correctedName: string,
): CorrectionRecord => ({
  correctedAccountCode: correctedCode,
  correctedAccountName: correctedName,
  invoiceId: extracted.invoiceId,
  itemKeywords: extracted.items.map((item) => item.description),
  originalAccountCode: extracted.items[ZERO]?.accountCode ?? "",
  timestamp: new Date().toISOString(),
  vendorName: extracted.vendorNormalized,
});

const formatProposal = (proposal: ImprovementProposal): string => {
  const header = `[${proposal.type}] ${proposal.description}`;
  const evidence = proposal.evidence.map((ev) => `  根拠: ${ev}`).join("\n");
  return `${header}\n${evidence}\n  ステータス: ${proposal.status}`;
};

export {
  type CorrectionRecord,
  type ImprovementEngine,
  buildCorrectionFromExtracted,
  createEngine,
  formatProposal,
  generateProposals,
  recordCorrection,
};
