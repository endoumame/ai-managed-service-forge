// ハーネス層: 終了条件管理（チェックリスト）
// AIに自己申告させず、外部からタスク完了を判定する — ドリフト問題への本質的対策

const EMPTY = 0;
const PERCENT = 100;
const TRIAGE_COVERAGE_THRESHOLD = 0.8;

interface ChecklistItem {
  id: string;
  description: string;
  completed: boolean;
  validator: () => boolean;
}

class CompletionPlanner {
  private checklist: ChecklistItem[] = [];

  addItem(id: string, description: string, validator: () => boolean): void {
    this.checklist.push({ completed: false, description, id, validator });
  }

  validate(): { allComplete: boolean; items: ChecklistItem[] } {
    for (const item of this.checklist) {
      item.completed = item.validator();
    }
    return {
      allComplete: this.checklist.every((item) => item.completed),
      items: [...this.checklist],
    };
  }

  getProgress(): { completed: number; total: number; percentage: number } {
    const result = this.validate();
    const completed = result.items.filter((item) => item.completed).length;
    return {
      completed,
      percentage: result.items.length > EMPTY ? (completed / result.items.length) * PERCENT : EMPTY,
      total: result.items.length,
    };
  }

  formatStatus(): string {
    const result = this.validate();
    const lines: string[] = ["\n=== Completion Checklist ==="];
    for (const item of result.items) {
      const mark = item.completed ? "✓" : "✗";
      lines.push(`  [${mark}] ${item.description}`);
    }
    const progress = this.getProgress();
    lines.push(
      `\nProgress: ${progress.completed}/${progress.total} (${progress.percentage.toFixed(EMPTY)}%)`,
    );
    const status = result.allComplete
      ? "Status: ALL COMPLETE — safe to proceed\n"
      : "Status: INCOMPLETE — cannot proceed to next phase\n";
    lines.push(status);
    return lines.join("\n");
  }
}

const createScanPlanner = (state: {
  scannedPackages: string[];
  totalPackages: string[];
  vulnerabilities: unknown[];
}): CompletionPlanner => {
  const planner = new CompletionPlanner();

  planner.addItem(
    "scan_all_packages",
    "All dependency packages have been scanned",
    () => state.scannedPackages.length >= state.totalPackages.length,
  );

  planner.addItem(
    "vulnerabilities_recorded",
    "Vulnerability scan results have been recorded",
    () => state.vulnerabilities.length >= EMPTY && state.scannedPackages.length > EMPTY,
  );

  return planner;
};

const createTriagePlanner = (state: {
  criticalCount: number;
  triagedCriticalCount: number;
  totalVulnerabilities: number;
  triagedTotal: number;
}): CompletionPlanner => {
  const planner = new CompletionPlanner();

  planner.addItem(
    "all_critical_triaged",
    "100% of Critical/High vulnerabilities have been triaged",
    () => state.triagedCriticalCount >= state.criticalCount,
  );

  planner.addItem(
    "majority_triaged",
    "80%+ of all vulnerabilities have been triaged",
    () =>
      state.totalVulnerabilities === EMPTY ||
      state.triagedTotal / state.totalVulnerabilities >= TRIAGE_COVERAGE_THRESHOLD,
  );

  return planner;
};

export { CompletionPlanner, createScanPlanner, createTriagePlanner, type ChecklistItem };
