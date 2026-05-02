/**
 * ナレッジ管理: ストレージ層
 *
 * 仕訳パターンと取引先履歴を管理する純粋なデータ操作層。
 * ファイルI/Oは行わず、デモ層がデータの読み書きを担当する。
 * 実運用ではDB/KVストアから取得したデータを渡す。
 */
import type { KnowledgeRule } from "../types.ts";

interface VendorHistory {
  averageAmount: number;
  invoiceCount: number;
  lastInvoiceDate: string;
}

interface KnowledgeBase {
  pendingUpdates: PendingUpdate[];
  rules: KnowledgeRule[];
  vendorHistory: Record<string, VendorHistory>;
}

interface PendingUpdate {
  account: string;
  pattern: string;
  reason: string;
  timestamp: string;
  vendor: string;
}

const INITIAL_COUNT = 1;

const createEmptyKnowledgeBase = (): KnowledgeBase => ({
  pendingUpdates: [],
  rules: [],
  vendorHistory: {},
});

const findRulesForVendor = (kb: KnowledgeBase, vendor: string): KnowledgeRule[] =>
  kb.rules.filter((rule) => rule.vendor === vendor);

const getVendorHistory = (kb: KnowledgeBase, vendor: string): VendorHistory | undefined =>
  kb.vendorHistory[vendor];

interface VendorUpdateInput {
  invoiceDate: string;
  newAmount: number;
  vendor: string;
}

/** 取引先の平均金額を更新する */
const updateVendorHistory = (kb: KnowledgeBase, input: VendorUpdateInput): KnowledgeBase => {
  if (input.vendor in kb.vendorHistory) {
    const existing = kb.vendorHistory[input.vendor];
    const newCount = existing.invoiceCount + INITIAL_COUNT;
    const newAverage =
      (existing.averageAmount * existing.invoiceCount + input.newAmount) / newCount;
    return {
      ...kb,
      vendorHistory: {
        ...kb.vendorHistory,
        [input.vendor]: {
          averageAmount: Math.round(newAverage),
          invoiceCount: newCount,
          lastInvoiceDate: input.invoiceDate,
        },
      },
    };
  }

  return {
    ...kb,
    vendorHistory: {
      ...kb.vendorHistory,
      [input.vendor]: {
        averageAmount: input.newAmount,
        invoiceCount: INITIAL_COUNT,
        lastInvoiceDate: input.invoiceDate,
      },
    },
  };
};

export type { KnowledgeBase, PendingUpdate, VendorHistory, VendorUpdateInput };
export { createEmptyKnowledgeBase, findRulesForVendor, getVendorHistory, updateVendorHistory };
