/**
 * ナレッジストア — 勘定科目マッピングルールの永続化
 *
 * ユーザーの修正をルールとして蓄積し、次回以降に活用する。
 * プロトタイプではインメモリストアを使用する。
 * 本番環境ではDB/JSONファイルに差し替える。
 */

import type { AccountMappingRule } from "../types.ts";

const INCREMENT = 1;

/** インメモリストア（プロトタイプ用） */
let ruleStore: AccountMappingRule[] = [];

/** ストアからルール一覧を読み込む */
const loadRules = (): AccountMappingRule[] => [...ruleStore];

/** ストアにルール一覧を保存する */
const saveRules = (rules: AccountMappingRule[]): void => {
  ruleStore = [...rules];
};

/** ストアを初期データでリセットする（テスト・デモ用） */
const resetStore = (initial: AccountMappingRule[]): void => {
  ruleStore = [...initial];
};

/** 取引先名と摘要パターンから既存ルールを検索する */
const findRule = (vendorName: string, description: string): AccountMappingRule | null => {
  const rules = loadRules();
  return (
    rules.find(
      (rule) => rule.vendorName === vendorName && description.includes(rule.descriptionPattern),
    ) ?? null
  );
};

/** 既存ルールの利用回数を更新する */
const matchesRule = (rule: AccountMappingRule, vendorName: string, pattern: string): boolean =>
  rule.vendorName === vendorName && rule.descriptionPattern === pattern;

/** 既存ルールの利用回数を更新する */
const incrementUsage = (vendorName: string, descriptionPattern: string): void => {
  const rules = loadRules();
  const idx = rules.findIndex((rule) => matchesRule(rule, vendorName, descriptionPattern));
  const NOT_FOUND = -1;
  if (idx === NOT_FOUND) {
    return;
  }
  rules[idx] = {
    ...rules[idx],
    lastUsed: new Date().toISOString(),
    occurrences: rules[idx].occurrences + INCREMENT,
  };
  saveRules(rules);
};

/** 新しいルールを追加する（未承認状態） */
const addPendingRule = (rule: AccountMappingRule): void => {
  const rules = loadRules();
  rules.push({ ...rule, approved: false });
  saveRules(rules);
};

export { loadRules, saveRules, resetStore, findRule, incrementUsage, addPendingRule };
