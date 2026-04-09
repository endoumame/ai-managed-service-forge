/**
 * ナレッジ自動改善ループ
 *
 * ユーザーの修正をナレッジに反映し、次回の推定精度を向上させる。
 * 改善は「提案 → 承認 → 反映」の3ステップで行い、
 * AIが勝手にナレッジを変更することを防ぐ（ヒューマン・イン・ザ・ループ）。
 */

import type {
  AccountClassification,
  AccountMapping,
  ExtractedInvoice,
  KnowledgeEntry,
  ProcessingResult,
} from "../types.ts";
import { log } from "../logger.ts";

/** 使用回数の初期値 */
const INITIAL_USAGE = 1;

/** FindIndex の未検出値 */
const NOT_FOUND = -1;

/** 使用回数のデフォルト値 */
const DEFAULT_USAGE = 0;

interface MappingUpdateInput {
  mappings: AccountMapping[];
  invoice: ExtractedInvoice;
  classification: AccountClassification;
  timestamp: string;
}

/** 処理結果からナレッジ改善提案を生成する */
const proposeImprovements = (result: ProcessingResult): string[] =>
  result.knowledgeUpdates.map((update) => `[改善提案] ${update}`);

/** 新規マッピングを構築する */
const buildMapping = (
  invoice: ExtractedInvoice,
  classification: AccountClassification,
  timestamp: string,
): AccountMapping => ({
  accountCode: classification.accountCode,
  accountName: classification.accountName,
  descriptionPattern: invoice.lineItems.map((item) => item.description).join("|"),
  lastUsed: timestamp,
  usageCount: INITIAL_USAGE,
  vendorName: invoice.vendorName,
});

/** 勘定科目マッピングを更新する */
const updateAccountMappings = ({
  mappings,
  invoice,
  classification,
  timestamp,
}: MappingUpdateInput): AccountMapping[] => {
  const result = [...mappings];
  const existingIndex = result.findIndex((mapping) => mapping.vendorName === invoice.vendorName);
  const newMapping = buildMapping(invoice, classification, timestamp);

  if (existingIndex === NOT_FOUND) {
    result.push(newMapping);
    log(`[Knowledge] 新規マッピング追加: ${invoice.vendorName} → ${classification.accountName}`);
  } else {
    const existing = result[existingIndex];
    result[existingIndex] = {
      ...newMapping,
      usageCount: (existing?.usageCount ?? DEFAULT_USAGE) + INITIAL_USAGE,
    };
    log(`[Knowledge] マッピング更新: ${invoice.vendorName} → ${classification.accountName}`);
  }

  return result;
};

/** 承認された改善をナレッジに適用する */
const applyImprovement = (
  knowledge: KnowledgeEntry,
  invoice: ExtractedInvoice,
  classification: AccountClassification,
): KnowledgeEntry => {
  const now = new Date().toISOString();

  return {
    ...knowledge,
    accountMappings: updateAccountMappings({
      classification,
      invoice,
      mappings: knowledge.accountMappings,
      timestamp: now,
    }),
    processedInvoices: [
      ...knowledge.processedInvoices,
      {
        invoiceNumber: invoice.invoiceNumber,
        processedAt: now,
        totalAmount: invoice.totalAmount,
        vendorName: invoice.vendorName,
      },
    ],
  };
};

export { applyImprovement, proposeImprovements };
