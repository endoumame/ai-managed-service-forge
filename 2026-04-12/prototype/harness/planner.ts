/**
 * ContractShield ハーネス層 - 終了条件管理（プランナー）
 *
 * なぜ終了条件を外部管理するか:
 * AIエージェントに「完了したか？」を自己判断させると、
 * 「もう十分」と途中完了宣言するドリフトが発生する。
 * ハーネスがチェックリスト方式で終了条件を管理し、
 * 全条件が満たされるまで完了を許さない設計とする。
 */

import type { ChecklistItem, ClauseAnalysis, CompletionChecklist, Contract } from "../types.ts";

const NONE_COUNT = 0;
const PERCENT = 100;

/** 初期チェックリストを生成する */
const createChecklist = (contract: Contract): CompletionChecklist => {
  const items: ChecklistItem[] = [
    ...contract.clauses.map((cl) => ({
      completed: false,
      description: `第${cl.number}条「${cl.title}」の分析完了`,
      id: `analyze-${cl.id}`,
      timestamp: null,
      verifiedBy: "harness" as const,
    })),
    {
      completed: false,
      description: "全条項の分析が完了していること",
      id: "all-analyzed",
      timestamp: null,
      verifiedBy: "harness" as const,
    },
    {
      completed: false,
      description: "高リスク条項の人間レビューが完了していること",
      id: "human-review",
      timestamp: null,
      verifiedBy: "human" as const,
    },
    {
      completed: false,
      description: "レポートが正常に生成されていること",
      id: "report-generated",
      timestamp: null,
      verifiedBy: "harness" as const,
    },
  ];

  return { allCompleted: false, completedAt: null, items };
};

/** 条項分析項目の完了判定 */
const updateAnalyzeItem = (
  item: ChecklistItem,
  analyses: ClauseAnalysis[],
  timestamp: string,
): ChecklistItem => {
  const clauseId = item.id.replace("analyze-", "");
  const found = analyses.some((an) => an.clauseId === clauseId && an.status !== "pending");

  return found ? { ...item, completed: true, timestamp } : item;
};

/** 全条項分析完了項目の判定 */
const updateAllAnalyzedItem = (
  item: ChecklistItem,
  analyses: ClauseAnalysis[],
  timestamp: string,
): ChecklistItem => {
  const allDone = analyses.length > NONE_COUNT && analyses.every((an) => an.status !== "pending");

  return allDone ? { ...item, completed: true, timestamp } : item;
};

/** 個別のチェックリスト項目を更新する */
const updateSingleItem = (
  item: ChecklistItem,
  analyses: ClauseAnalysis[],
  timestamp: string,
): ChecklistItem => {
  if (item.completed) {
    return item;
  }
  if (item.id.startsWith("analyze-")) {
    return updateAnalyzeItem(item, analyses, timestamp);
  }
  if (item.id === "all-analyzed") {
    return updateAllAnalyzedItem(item, analyses, timestamp);
  }
  return item;
};

/** 更新済みアイテムから完了状態を算出する */
const buildChecklist = (updatedItems: ChecklistItem[], now: string): CompletionChecklist => {
  const allDone = updatedItems.every((it) => it.completed);
  return {
    allCompleted: allDone,
    completedAt: allDone ? now : null,
    items: updatedItems,
  };
};

/** 分析結果に基づいてチェックリストを更新する */
const updateChecklist = (
  checklist: CompletionChecklist,
  analyses: ClauseAnalysis[],
): CompletionChecklist => {
  const now = new Date().toISOString();
  const updatedItems = checklist.items.map((item) => updateSingleItem(item, analyses, now));
  return buildChecklist(updatedItems, now);
};

/** 特定IDの項目を完了にマークする汎用ヘルパー */
const markItemCompleted = (checklist: CompletionChecklist, itemId: string): CompletionChecklist => {
  const now = new Date().toISOString();
  const updatedItems = checklist.items.map((item) => {
    if (item.id === itemId && !item.completed) {
      return { ...item, completed: true, timestamp: now };
    }
    return item;
  });
  return buildChecklist(updatedItems, now);
};

/** レポート生成完了をマークする */
const markReportGenerated = (checklist: CompletionChecklist): CompletionChecklist =>
  markItemCompleted(checklist, "report-generated");

/** 人間レビュー完了をマークする（ヒューマン・イン・ザ・ループ） */
const markHumanReviewCompleted = (checklist: CompletionChecklist): CompletionChecklist =>
  markItemCompleted(checklist, "human-review");

/** チェックリストの進捗サマリーを返す */
const getProgress = (
  checklist: CompletionChecklist,
): { completed: number; total: number; percentage: number } => {
  const total = checklist.items.length;
  const completed = checklist.items.filter((it) => it.completed).length;
  const percentage = total > NONE_COUNT ? Math.round((completed / total) * PERCENT) : NONE_COUNT;
  return { completed, percentage, total };
};

export {
  createChecklist,
  getProgress,
  markHumanReviewCompleted,
  markReportGenerated,
  updateChecklist,
};
