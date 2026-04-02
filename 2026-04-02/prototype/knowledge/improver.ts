/**
 * ナレッジ自動改善ループ
 *
 * なぜ自動改善が必要か:
 * マネージドサービスの核心的価値は「使えば使うほど賢くなる」こと。
 * ユーザーの仕訳修正をフィードバックとして取り込み、
 * 次回同じパターンが来たときに正しい推定ができるようにする。
 * ただし、AIの推定をそのまま反映するのではなく、
 * ユーザーの承認を経た「検証済みデータ」のみを採用する。
 */

import type { ImprovementSuggestion, JournalEntry } from "../harness/types.js";
import type { KnowledgeStore } from "./store.js";

const MIN_CORRECTIONS_FOR_SUGGESTION = 2;

interface CorrectionInput {
  store: KnowledgeStore;
  vendor: string;
  originalEntry: JournalEntry;
  correctedEntry: JournalEntry;
}

/**
 * ユーザーの修正履歴から改善提案を生成する
 */
const generateSuggestions = (input: CorrectionInput): ImprovementSuggestion[] => {
  const { correctedEntry, originalEntry, store, vendor } = input;
  const suggestions: ImprovementSuggestion[] = [];

  if (originalEntry.debitAccountCode === correctedEntry.debitAccountCode) {
    return suggestions;
  }

  const existing = store.findMapping(vendor, originalEntry.description);

  if (existing === null) {
    suggestions.push({
      itemPattern: originalEntry.description,
      reason: `新規取引先「${vendor}」の品目「${originalEntry.description}」に対するマッピングが未登録です`,
      suggestedAccountCode: correctedEntry.debitAccountCode,
      suggestedAccountName: correctedEntry.debitAccountName,
      type: "new_mapping",
      vendor,
    });
  } else if (existing.accountCode !== correctedEntry.debitAccountCode) {
    suggestions.push({
      itemPattern: originalEntry.description,
      reason: `取引先「${vendor}」の品目「${originalEntry.description}」は現在「${existing.accountName}」ですが、「${correctedEntry.debitAccountName}」への修正が検出されました`,
      suggestedAccountCode: correctedEntry.debitAccountCode,
      suggestedAccountName: correctedEntry.debitAccountName,
      type: "update_mapping",
      vendor,
    });
  }

  return suggestions;
};

/**
 * ユーザーが改善提案を承認した場合にナレッジを更新する
 */
const applySuggestion = (store: KnowledgeStore, suggestion: ImprovementSuggestion): void => {
  store.upsertMapping({
    accountCode: suggestion.suggestedAccountCode,
    accountName: suggestion.suggestedAccountName,
    itemPattern: suggestion.itemPattern,
    vendor: suggestion.vendor,
  });
};

export { applySuggestion, generateSuggestions, MIN_CORRECTIONS_FOR_SUGGESTION };
export type { CorrectionInput };
