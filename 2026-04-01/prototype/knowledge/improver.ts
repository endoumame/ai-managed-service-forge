/**
 * ナレッジ自動改善ループ
 *
 * なぜこの実装か:
 * AIマネージドサービスの差別化要因は「時間とともに賢くなる」こと。
 * 人間の修正フィードバックを分析し、ナレッジの改善提案を自動生成する。
 *
 * 改善提案はあくまで「提案」であり、人間の承認なしにはナレッジを更新しない。
 * これがヒューマン・イン・ザ・ループの接点として機能する。
 */

import type { CorrectionRecord, KnowledgeData } from "./store.ts";

interface ImprovementProposal {
  vendorName: string;
  description: string;
  currentAccountCode: string;
  proposedAccountCode: string;
  reason: string;
  correctionCount: number;
  status: "pending" | "approved" | "rejected";
}

const MIN_CORRECTIONS_FOR_PROPOSAL = 2;
const OFFSET_ONE = 1;
const EMPTY_PROPOSALS = 0;
const DISPLAY_OFFSET = 1;

// eslint-disable-next-line no-undefined -- nullish check helper
const isNullish = (val: unknown): val is null | undefined => val === null || val === undefined;

/** 修正記録を取引先×品目でグループ化 */
const groupCorrections = (corrections: CorrectionRecord[]): Map<string, CorrectionRecord[]> => {
  const groups = new Map<string, CorrectionRecord[]>();
  for (const cr of corrections) {
    const key = `${cr.vendorName}::${cr.description}`;
    const existing = groups.get(key) ?? [];
    existing.push(cr);
    groups.set(key, existing);
  }
  return groups;
};

const KEY_VENDOR_IDX = 0;
const KEY_DESC_IDX = 1;

interface ParsedKey {
  vendorName: string;
  description: string;
}

/** "vendorName::description" 形式のキーをパース */
const parseGroupKey = (key: string): ParsedKey | null => {
  const parts = key.split("::");
  const vendorName = parts[KEY_VENDOR_IDX];
  const description = parts[KEY_DESC_IDX];
  if (typeof vendorName !== "string" || typeof description !== "string") {
    return null;
  }
  return { description, vendorName };
};

/** 最新の修正レコードを取得 */
const getLatestCorrection = (corrections: CorrectionRecord[]): CorrectionRecord | null => {
  const latestIdx = corrections.length - MIN_CORRECTIONS_FOR_PROPOSAL + OFFSET_ONE;
  const record = corrections[latestIdx];
  return isNullish(record) ? null : record;
};

/** 個別のグループから改善提案を生成（該当しなければnull） */
const buildProposalFromGroup = (
  key: string,
  corrections: CorrectionRecord[],
): ImprovementProposal | null => {
  if (corrections.length < MIN_CORRECTIONS_FOR_PROPOSAL) {
    return null;
  }
  const latest = getLatestCorrection(corrections);
  const parsed = parseGroupKey(key);
  if (latest === null || parsed === null) {
    return null;
  }
  return {
    correctionCount: corrections.length,
    currentAccountCode: latest.originalAccountCode,
    description: parsed.description,
    proposedAccountCode: latest.correctedAccountCode,
    reason:
      `同一の取引先×品目で${String(corrections.length)}回の修正が発生。` +
      `最新の修正先科目「${latest.correctedAccountCode}」への変更を提案します。`,
    status: "pending",
    vendorName: parsed.vendorName,
  };
};

/** 修正パターンを集計して改善提案を生成 */
const generateProposals = (knowledge: KnowledgeData): ImprovementProposal[] => {
  const correctionGroups = groupCorrections(knowledge.corrections);
  const proposals: ImprovementProposal[] = [];

  for (const [key, corrections] of correctionGroups.entries()) {
    const proposal = buildProposalFromGroup(key, corrections);
    if (proposal !== null) {
      proposals.push(proposal);
    }
  }

  return proposals;
};

/** 改善提案のサマリーを表示用文字列で返す */
const formatProposals = (proposals: ImprovementProposal[]): string => {
  if (proposals.length === EMPTY_PROPOSALS) {
    return "現在、改善提案はありません。";
  }

  const lines = proposals.map(
    (pr, idx) =>
      `${String(idx + DISPLAY_OFFSET)}. [${pr.vendorName}] ${pr.description}\n` +
      `   現在: ${pr.currentAccountCode} -> 提案: ${pr.proposedAccountCode}\n` +
      `   理由: ${pr.reason}\n` +
      `   修正回数: ${String(pr.correctionCount)}`,
  );

  return [`=== ナレッジ改善提案 (${String(proposals.length)}件) ===`, ...lines].join("\n\n");
};

export { formatProposals, generateProposals };
export type { ImprovementProposal };
