// ハーネス層: 終了条件管理（チェックリスト）
// AIに完了を自己申告させず、外部チェックリストで進行状況を管理する

import type { ChecklistItem } from "../types.ts";
import { log } from "../logger.ts";

export class CompletionPlanner {
  private checklist: ChecklistItem[] = [];

  constructor(invoiceCount: number) {
    this.checklist = [
      {
        completed: false,
        description: `全請求書のデータ抽出完了 (0/${invoiceCount})`,
        id: "extract-all",
      },
      {
        completed: false,
        description: "全請求書の品質チェック完了",
        id: "validate-all",
      },
      {
        completed: false,
        description: `全請求書の発注書照合完了 (0/${invoiceCount})`,
        id: "match-all",
      },
      {
        completed: false,
        description: "全仕訳候補の生成完了",
        id: "journal-all",
      },
      {
        completed: false,
        description: "要レビューアイテムの分類完了",
        id: "review-flagged",
      },
      {
        completed: false,
        description: "処理サマリーの生成完了",
        id: "summary-generated",
      },
    ];
  }

  markComplete(id: string, validationResult?: string): void {
    const item = this.checklist.find((ci) => ci.id === id);
    if (item) {
      item.completed = true;
      item.completedAt = new Date().toISOString();
      item.validationResult = validationResult;
    }
  }

  updateDescription(id: string, description: string): void {
    const item = this.checklist.find((ci) => ci.id === id);
    if (item) {
      item.description = description;
    }
  }

  isComplete(): boolean {
    return this.checklist.every((item) => item.completed);
  }

  getPendingItems(): ChecklistItem[] {
    return this.checklist.filter((item) => !item.completed);
  }

  printStatus(): void {
    log("\n  [Checklist] 進捗状況:");
    for (const item of this.checklist) {
      const icon = item.completed ? "✓" : "○";
      const time = typeof item.completedAt === "string" ? ` (${item.completedAt})` : "";
      log(`    ${icon} ${item.description}${time}`);
      if (typeof item.validationResult === "string") {
        log(`      → ${item.validationResult}`);
      }
    }
    const completed = this.checklist.filter((ci) => ci.completed).length;
    log(`    --- ${completed}/${this.checklist.length} 完了 ---\n`);
  }

  getChecklist(): ChecklistItem[] {
    return [...this.checklist];
  }
}
