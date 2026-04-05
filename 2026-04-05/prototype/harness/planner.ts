/**
 * Harness/planner.ts — 終了条件管理（チェックリスト）
 *
 * なぜこの実装か:
 * AIエージェントのドリフト問題への対策。
 * AIに「完了したか？」を自己申告させるのではなく、
 * ハーネスが外部からチェックリストを管理し、全条件を満たした時のみ完了とする。
 * これにより「もう十分」という途中完了宣言を防ぐ。
 */

const ZERO = 0;

interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
  completedAt?: string;
  /** オプションの自動検証関数 */
  validator?: () => boolean;
}

class CompletionPlanner {
  private items = new Map<string, ChecklistItem>();

  /**
   * チェックリストにアイテムを追加する
   * 各アイテムにはオプションで自動検証関数を設定できる
   */
  addItem(id: string, label: string, validator?: () => boolean): void {
    this.items.set(id, { completed: false, id, label, validator });
  }

  /**
   * アイテムを完了にマークする
   * validator が設定されている場合、validator が true を返した時のみ完了にできる。
   * これによりAIが「完了した」と申告しても、実際に検証が通らなければ完了にならない。
   */
  markComplete(id: string): boolean {
    const item = this.items.get(id);
    if (!item) {
      return false;
    }

    if (item.validator && !item.validator()) {
      return false;
    }

    item.completed = true;
    item.completedAt = new Date().toISOString();
    return true;
  }

  /**
   * 全アイテムが完了しているか（= 処理全体が完了しているか）
   */
  isAllComplete(): boolean {
    return [...this.items.values()].every((item) => item.completed);
  }

  /**
   * 未完了アイテムの一覧を返す
   */
  getPendingItems(): ChecklistItem[] {
    return [...this.items.values()].filter((item) => !item.completed);
  }

  /**
   * チェックリスト全体のステータスをレポートする
   */
  getReport(): string {
    const lines: string[] = ["=== 終了条件チェックリスト ==="];
    for (const item of this.items.values()) {
      const status = item.completed ? "[✓]" : "[ ]";
      const time =
        typeof item.completedAt === "string" && item.completedAt.length > ZERO
          ? ` (${item.completedAt})`
          : "";
      lines.push(`  ${status} ${item.label}${time}`);
    }
    const completedCount = [...this.items.values()].filter((item) => item.completed).length;
    lines.push(`\n進捗: ${completedCount}/${this.items.size}`);
    lines.push(
      this.isAllComplete() ? "→ 全条件クリア: 処理完了" : "→ 未完了項目あり: 処理継続が必要",
    );
    return lines.join("\n");
  }
}

export { CompletionPlanner };
export type { ChecklistItem };
