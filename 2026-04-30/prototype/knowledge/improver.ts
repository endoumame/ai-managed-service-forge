import type { JournalEntry, KnowledgeImprovement, KnowledgePattern } from "../types.js";
import type { KnowledgeStore } from "./store.js";
import { findMatchingPattern } from "./store.js";

const CONFLICT_NONE = 0;

const createPatternFromApproval = (entry: JournalEntry, approver: string): KnowledgePattern => {
  const expenseLine = entry.lines.find((line) => line.debit > CONFLICT_NONE);
  return {
    accountCode: expenseLine?.accountCode ?? "",
    accountName: expenseLine?.accountName ?? "",
    approvedBy: approver,
    counterparty: entry.description.split(/\s+/)[CONFLICT_NONE] ?? "",
    descriptionKeywords: entry.description.toLowerCase().split(/\s+/),
    id: `KP-${Date.now()}`,
    lastUsed: new Date().toISOString(),
    taxCategory: expenseLine?.taxCategory ?? "taxable_10",
    usageCount: 1,
  };
};

const detectConflict = (
  store: KnowledgeStore,
  newEntry: JournalEntry,
): KnowledgeImprovement | null => {
  const expenseLine = newEntry.lines.find((line) => line.debit > CONFLICT_NONE);
  if (!expenseLine) {
    return null;
  }

  const existing = findMatchingPattern(store, newEntry.description, newEntry.description);
  if (!existing) {
    return null;
  }

  if (existing.accountCode !== expenseLine.accountCode) {
    return {
      conflictingPatterns: [existing, createPatternFromApproval(newEntry, "system")],
      createdAt: new Date().toISOString(),
      description: `同一パターンで異なる勘定科目: 既存=${existing.accountName}(${existing.accountCode}) vs 新規=${expenseLine.accountName}(${expenseLine.accountCode})`,
      id: `KI-${Date.now()}`,
      status: "proposed",
      type: "conflict_detected",
    };
  }

  return null;
};

const proposeNewPattern = (
  store: KnowledgeStore,
  entry: JournalEntry,
  approver: string,
): KnowledgeImprovement | null => {
  const existing = findMatchingPattern(store, entry.description, entry.description);
  if (existing) {
    return null;
  }

  const proposed = createPatternFromApproval(entry, approver);
  return {
    createdAt: new Date().toISOString(),
    description: `新規パターン提案: ${proposed.counterparty} → ${proposed.accountName}(${proposed.accountCode})`,
    id: `KI-${Date.now()}`,
    proposedPattern: proposed,
    status: "proposed",
    type: "new_pattern",
  };
};

export { createPatternFromApproval, detectConflict, proposeNewPattern };
