/**
 * Knowledge/improver.ts — 自動改善ループ
 *
 * なぜこの実装か:
 * 人間が仕訳を修正した場合、その修正パターンをナレッジベースに反映提案する。
 * ただし自動適用はせず、必ず人間の承認を経る（ヒューマン・イン・ザ・ループ）。
 * これにより「AIが勝手にルールを変える」リスクを防ぐ。
 */

import type { ImprovementProposal, JournalEntry, JournalLine, VendorMapping } from "../types.ts";
import type { KnowledgeStore } from "./store.ts";

const ZERO = 0;
const ONE = 1;
let proposalCounter = ZERO;

const generateId = (): string => {
  proposalCounter += ONE;
  return `proposal-${Date.now()}-${proposalCounter}`;
};

/** 修正後のマッピングルールを生成 */
const buildProposedRule = (vendorName: string, correctedAccount: JournalLine): VendorMapping => ({
  accountCode: correctedAccount.accountCode,
  accountName: correctedAccount.accountName,
  lastUsed: new Date().toISOString(),
  source: "human-correction",
  usageCount: ONE,
  vendorName,
});

interface BuildProposalInput {
  vendorName: string;
  originalAccount: JournalLine;
  proposedRule: VendorMapping;
  existingMapping: VendorMapping | null;
}

/** 提案オブジェクトを組み立てる */
const buildProposal = (input: BuildProposalInput): ImprovementProposal => {
  const { vendorName, originalAccount, proposedRule, existingMapping } = input;
  const reason = `人間が仕訳を修正: ${originalAccount.accountName} → ${proposedRule.accountName}`;
  const hasExisting = typeof existingMapping === "object" && existingMapping !== null;

  return {
    ...(hasExisting ? { currentRule: existingMapping } : {}),
    createdAt: new Date().toISOString(),
    description: hasExisting
      ? `取引先「${vendorName}」の勘定科目を「${existingMapping.accountName}」から「${proposedRule.accountName}」に変更`
      : `取引先「${vendorName}」に勘定科目「${proposedRule.accountName}」を新規マッピング`,
    id: generateId(),
    proposedRule,
    reason,
    status: "pending" as const,
    type: hasExisting ? ("update-mapping" as const) : ("new-mapping" as const),
  };
};

interface DetectImprovementInput {
  vendorName: string;
  originalEntry: JournalEntry;
  correctedEntry: JournalEntry;
  store: KnowledgeStore;
}

/** 仕訳の先頭行を安全に取得し、変更があるペアのみ返す */
const extractChangedAccounts = (
  originalEntry: JournalEntry,
  correctedEntry: JournalEntry,
): { original: JournalLine; corrected: JournalLine } | null => {
  const original = originalEntry.lines[ZERO];
  const corrected = correctedEntry.lines[ZERO];
  if (typeof original !== "object" || original === null) {
    return null;
  }
  if (typeof corrected !== "object" || corrected === null) {
    return null;
  }
  if (original.accountCode === corrected.accountCode) {
    return null;
  }
  return { corrected, original };
};

/**
 * 仕訳修正から改善提案を生成する
 *
 * 元の仕訳と修正後の仕訳を比較し、勘定科目が変わっていた場合に
 * 新しいマッピングルールを提案する。
 */
const detectImprovement = (input: DetectImprovementInput): ImprovementProposal | null => {
  const { vendorName, originalEntry, correctedEntry, store } = input;
  const accounts = extractChangedAccounts(originalEntry, correctedEntry);
  if (accounts === null) {
    return null;
  }

  const proposedRule = buildProposedRule(vendorName, accounts.corrected);
  return buildProposal({
    existingMapping: store.findMapping(vendorName),
    originalAccount: accounts.original,
    proposedRule,
    vendorName,
  });
};

/**
 * 矛盾検知: 同一取引先に異なる勘定科目が使われていないかチェック
 */
const detectConflict = (
  vendorName: string,
  accountCode: string,
  store: KnowledgeStore,
): ImprovementProposal | null => {
  const existing = store.findMapping(vendorName);
  if (typeof existing !== "object" || existing === null) {
    return null;
  }
  if (existing.accountCode === accountCode) {
    return null;
  }

  return {
    createdAt: new Date().toISOString(),
    currentRule: existing,
    description: `取引先「${vendorName}」に矛盾するマッピング検出: 既存「${existing.accountName}」 vs 新「${accountCode}」`,
    id: generateId(),
    proposedRule: { ...existing, accountCode, lastUsed: new Date().toISOString() },
    reason: "同一取引先に対して異なる勘定科目が使用された",
    status: "pending",
    type: "conflict-detected",
  };
};

export { detectConflict, detectImprovement };
export type { DetectImprovementInput };
