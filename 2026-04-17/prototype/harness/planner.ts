// ハーネス層: 終了条件管理
// AIの自己申告に依存せず、外部からタスク完了を判定する

interface CompletionCriterion {
  id: string;
  description: string;
  completed: boolean;
  verifier: () => boolean;
}

class CompletionPlanner {
  private criteria: CompletionCriterion[] = [];

  addCriterion(id: string, description: string, verifier: () => boolean): void {
    this.criteria.push({ completed: false, description, id, verifier });
  }

  // 全基準を外部から検証
  verify(): { allComplete: boolean; results: CompletionCriterion[] } {
    for (const criterion of this.criteria) {
      criterion.completed = criterion.verifier();
    }
    return {
      allComplete: this.criteria.every((criterion) => criterion.completed),
      results: [...this.criteria],
    };
  }

  // チェックリスト形式で出力
  formatChecklist(): string {
    const lines: string[] = ["── 終了条件チェックリスト ──"];
    for (const criterion of this.criteria) {
      const mark = criterion.completed ? "✓" : "✗";
      lines.push(`  [${mark}] ${criterion.description}`);
    }
    const { allComplete } = this.verify();
    lines.push(
      allComplete ? "  → 全条件充足: レビュー完了" : "  → 未完了条件あり: レビュー継続が必要",
    );
    return lines.join("\n");
  }
}

export { type CompletionCriterion, CompletionPlanner };
