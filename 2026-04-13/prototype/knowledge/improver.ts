/**
 * ナレッジ自動改善ループ
 *
 * なぜ自動改善が必要か:
 * AIマネージドサービスの差別化ポイントは「使えば使うほど賢くなる」こと。
 * ユーザーの修正をフィードバックとして蓄積し、パターンを検出し、
 * ルール改善を「提案」する。ただし自動適用はしない（ヒューマン・イン・ザ・ループ）。
 */

/* eslint-disable no-magic-numbers, max-lines-per-function, max-statements, no-plusplus, prefer-destructuring, id-length, sort-imports, typescript-eslint/strict-boolean-expressions */

import type { ImprovementProposal, JournalEntry } from "../types/index.js";
import {
  addCorrectionRecord,
  addProposal,
  getCorrectionHistory,
  getVendorPattern,
  updateVendorPattern,
} from "./store.js";
import type { CorrectionRecord } from "./store.js";

/**
 * 仕訳確定後にナレッジを更新する
 * パイプラインの最終ステップで呼び出される
 */
const recordConfirmedJournal = (journal: JournalEntry): void => {
  const accountCodes = journal.entries
    .filter((entry) => entry.debit > 0)
    .map((entry) => entry.accountCode);
  updateVendorPattern(journal.vendor, accountCodes);
};

/**
 * ユーザーが仕訳を修正した場合に修正履歴を記録する
 * 修正前後の差分から学習データを生成
 */
const recordCorrection = (
  vendor: string,
  original: JournalEntry,
  corrected: JournalEntry,
): CorrectionRecord[] => {
  const records: CorrectionRecord[] = [];

  for (let idx = 0; idx < original.entries.length; idx += 1) {
    const orig = original.entries[idx];
    const corr = corrected.entries[idx];
    if (corr && orig.accountCode !== corr.accountCode) {
      const record: CorrectionRecord = {
        correctedAccountCode: corr.accountCode,
        correctedAccountName: corr.accountName,
        description: `${orig.accountName}(${orig.accountCode}) → ${corr.accountName}(${corr.accountCode})`,
        originalAccountCode: orig.accountCode,
        timestamp: new Date().toISOString(),
        vendor,
      };
      addCorrectionRecord(record);
      records.push(record);
    }
  }

  return records;
};

/**
 * 蓄積された修正履歴からパターンを分析し、改善提案を生成する
 *
 * 改善提案の条件:
 * - 同一取引先で同じ修正が2回以上発生 → ルール追加を提案
 * - 既存パターンと異なる科目が使われた → 矛盾として検知
 */
const analyzeAndPropose = (): ImprovementProposal[] => {
  const history = getCorrectionHistory();
  const proposals: ImprovementProposal[] = [];

  // 取引先×修正パターンごとの頻度を集計
  const correctionFrequency = new Map<string, { count: number; record: CorrectionRecord }>();

  for (const record of history) {
    const key = `${record.vendor}:${record.originalAccountCode}→${record.correctedAccountCode}`;
    const existing = correctionFrequency.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      correctionFrequency.set(key, { count: 1, record });
    }
  }

  // 2回以上修正されたパターンを改善提案として生成
  for (const [, { count, record }] of correctionFrequency) {
    if (count >= 2) {
      const proposal: ImprovementProposal = {
        createdAt: new Date().toISOString(),
        description: `取引先「${record.vendor}」の請求書で、AIが「${record.originalAccountCode}」と推定する項目を、ユーザーが${count}回「${record.correctedAccountCode}（${record.correctedAccountName}）」に修正しています。デフォルト科目として登録することを提案します。`,
        evidence: `修正回数: ${count}回`,
        id: `prop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        status: "pending",
        suggestedAccountCode: record.correctedAccountCode,
        suggestedAccountName: record.correctedAccountName,
        type: "new_rule",
        vendor: record.vendor,
      };
      addProposal(proposal);
      proposals.push(proposal);
    }
  }

  // 取引先パターンの矛盾検知
  for (const record of history) {
    const pattern = getVendorPattern(record.vendor);
    if (pattern && pattern.processedCount >= 3) {
      const topAccount = Object.entries(pattern.accountFrequency).toSorted(
        ([, countA], [, countB]) => countB - countA,
      )[0];

      if (
        topAccount &&
        topAccount[0] !== record.correctedAccountCode &&
        !(record.correctedAccountCode in pattern.accountFrequency)
      ) {
        const proposal: ImprovementProposal = {
          createdAt: new Date().toISOString(),
          description: `取引先「${record.vendor}」で通常使用される科目「${topAccount[0]}」と異なる科目「${record.correctedAccountCode}（${record.correctedAccountName}）」が使用されました。取引内容が変更された可能性があります。`,
          evidence: `通常科目: ${topAccount[0]}（使用回数: ${topAccount[1]}回）`,
          id: `prop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          status: "pending",
          suggestedAccountCode: record.correctedAccountCode,
          suggestedAccountName: record.correctedAccountName,
          type: "conflict_detected",
          vendor: record.vendor,
        };
        addProposal(proposal);
        proposals.push(proposal);
      }
    }
  }

  return proposals;
};

/**
 * 過去のパターンに基づいて、仕訳候補の確信度を補正する
 * ナレッジが蓄積されるほど確信度が上がるフィードバックループ
 */
const getPatternBasedConfidence = (vendor: string, accountCode: string): number => {
  const pattern = getVendorPattern(vendor);
  if (!pattern) {
    return 0;
  }

  const total = Object.values(pattern.accountFrequency).reduce((sum, count) => sum + count, 0);
  const codeCount = pattern.accountFrequency[accountCode] ?? 0;

  if (total === 0) {
    return 0;
  }
  return codeCount / total;
};

export { analyzeAndPropose, getPatternBasedConfidence, recordConfirmedJournal, recordCorrection };
