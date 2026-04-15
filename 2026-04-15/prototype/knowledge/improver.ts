/**
 * ナレッジ自動改善ループ
 *
 * なぜこの実装か:
 * AIマネージドサービスの核心は「使えば使うほど賢くなる」こと。
 * ユーザーの修正行動を自然にフィードバックとして収集し、
 * ルール化提案 → 人間承認 → 反映のループを回す。
 *
 * 自動で反映するのではなく、必ず人間の承認を経ることで、
 * 誤った学習の蓄積を防ぐ（ヒューマン・イン・ザ・ループ）。
 */

import type { ImprovementProposal, ProcessingRecord } from "../types.js";
import { getPendingProposals, recordCorrection } from "./store.js";
// eslint-disable-next-line sort-imports -- formatter reorders type/value imports from same module
import type { CorrectionRecord, KnowledgeState } from "./store.js";

const EMPTY = 0;

/**
 * 承認済みレコードからナレッジ改善のフィードバックを処理する。
 * ユーザーが勘定科目を修正した場合のみフィードバックを生成する。
 */
const processFeedback = (
  record: ProcessingRecord,
  knowledge: KnowledgeState,
): ImprovementProposal | null => {
  if (record.correctedAccountCode === null || record.classification === null) {
    return null;
  }

  // 修正がなければフィードバック不要
  if (record.correctedAccountCode === record.classification.accountCode) {
    return null;
  }

  const correction: CorrectionRecord = {
    correctedAccountCode: record.correctedAccountCode,
    correctedAccountName: record.correctedAccountName ?? "",
    itemKeyword: record.invoice.items.map((item) => item.description).join(", "),
    originalAccountCode: record.classification.accountCode,
    timestamp: new Date().toISOString(),
    vendor: record.invoice.vendor,
  };

  return recordCorrection(knowledge, correction);
};

/**
 * 個別の改善提案を文字列に変換する。
 */
const formatProposal = (prop: ImprovementProposal): string =>
  [
    `[${prop.id}] ${prop.vendor}`,
    `  現在: ${prop.currentAccountCode} → 提案: ${prop.proposedAccountCode} ${prop.proposedAccountName}`,
    `  修正実績: ${prop.correctionCount}回`,
    "",
  ].join("\n");

/**
 * 改善提案のサマリーレポートを生成する。
 */
const generateImprovementReport = (knowledge: KnowledgeState): string => {
  const pending = getPendingProposals(knowledge);
  const header = "=== ナレッジ改善提案レポート ===\n";

  if (pending.length <= EMPTY) {
    return `${header}\n現在、保留中の改善提案はありません。`;
  }

  const proposalLines = pending.map((prop) => formatProposal(prop));
  return `${header}\n${pending.length}件の改善提案があります:\n\n${proposalLines.join("\n")}`;
};

export { generateImprovementReport, processFeedback };
