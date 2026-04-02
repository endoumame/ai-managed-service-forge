/**
 * デモ用UI表示ヘルパー
 * CLI表示と入力をここに集約する
 */

/* eslint-disable no-console -- CLIアプリケーションのためconsole使用は意図的 */
/* eslint-disable no-await-in-loop -- ユーザー承認は逐次処理が必須 */
/* eslint-disable require-await -- フォーマッタがasyncを付与するためPromise返却関数に必要 */
/* eslint-disable import/no-nodejs-modules -- デモ層はNode.js環境前提 */
/* eslint-disable sort-imports -- eslint-disableブロックがインポート順を乱すため無効化 */

import type { ImprovementSuggestion, JournalEntry } from "../harness/types.js";
import { applySuggestion } from "../knowledge/improver.js";
import { createInterface } from "node:readline";
import type { KnowledgeStore } from "../knowledge/store.js";

const DIVIDER_LENGTH = 60;
const EMPTY_COUNT = 0;

const printDivider = (): void => {
  console.log("\u2500".repeat(DIVIDER_LENGTH));
};

const printHeader = (title: string): void => {
  printDivider();
  console.log(`  ${title}`);
  printDivider();
};

/** CLIでユーザー入力を受け付ける */
const askUser = async (question: string): Promise<string> => {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
};

/** 仕訳結果を表示する */
const printJournalEntries = (entries: JournalEntry[]): void => {
  for (const entry of entries) {
    console.log(
      `  借方: ${entry.debitAccountCode} ${entry.debitAccountName}  ${entry.amount.toLocaleString()}円`,
    );
    console.log(
      `  貸方: ${entry.creditAccountCode} ${entry.creditAccountName}  ${entry.amount.toLocaleString()}円`,
    );
    console.log(`  摘要: ${entry.description}`);
    console.log(`  税区分: ${entry.taxCategory}`);
    console.log("");
  }
};

/** 改善提案の詳細を表示する */
const printSuggestionDetail = (suggestion: ImprovementSuggestion): void => {
  const typeLabel = suggestion.type === "new_mapping" ? "新規追加" : "更新";
  console.log(
    [
      `  種別: ${typeLabel}`,
      `  取引先: ${suggestion.vendor}`,
      `  品目: ${suggestion.itemPattern}`,
      `  提案: ${suggestion.suggestedAccountCode} ${suggestion.suggestedAccountName}`,
      `  理由: ${suggestion.reason}`,
      "",
    ].join("\n"),
  );
};

/** 単一の改善提案を表示し承認結果を返す */
const processSingleSuggestion = async (
  suggestion: ImprovementSuggestion,
  store: KnowledgeStore,
): Promise<void> => {
  printSuggestionDetail(suggestion);
  const answer = await askUser("  この提案を承認しますか？ (y/n): ");
  if (answer.toLowerCase() === "y") {
    applySuggestion(store, suggestion);
    console.log("  -> 承認: ナレッジを更新しました");
  } else {
    console.log("  -> 却下: スキップしました");
  }
  console.log("");
};

/** 改善提案を表示し承認を求める */
const handleSuggestions = async (
  suggestions: ImprovementSuggestion[],
  store: KnowledgeStore,
): Promise<void> => {
  if (suggestions.length === EMPTY_COUNT) {
    return;
  }
  printHeader("ナレッジ改善提案");
  for (const suggestion of suggestions) {
    await processSingleSuggestion(suggestion, store);
  }
};

export { askUser, handleSuggestions, printHeader, printJournalEntries };
