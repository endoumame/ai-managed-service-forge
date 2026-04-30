// JournalCraft 共通型定義

interface TransactionInput {
  id: string;
  rawText: string;
  date?: string;
  submittedAt: string;
}

interface ExtractedTransaction {
  id: string;
  date: string;
  counterparty: string;
  description: string;
  amount: number;
  taxRate: number;
  rawText: string;
}

interface JournalLine {
  accountCode: string;
  accountName: string;
  subAccountCode?: string;
  subAccountName?: string;
  debit: number;
  credit: number;
  taxCategory: TaxCategory;
}

interface JournalEntry {
  id: string;
  transactionId: string;
  date: string;
  description: string;
  lines: JournalLine[];
  confidence: number;
  reasoning: string;
  status: JournalStatus;
  sourcePattern?: string;
}

type JournalStatus =
  | "draft"
  | "validated"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "needs_review";

type TaxCategory = "taxable_10" | "taxable_8" | "exempt" | "non_taxable" | "tax_free_export";

interface CompletionChecklist {
  transactionId: string;
  extracted: boolean;
  journalGenerated: boolean;
  balanceChecked: boolean;
  accountValidated: boolean;
  taxVerified: boolean;
  routed: boolean;
}

interface KnowledgePattern {
  id: string;
  counterparty: string;
  descriptionKeywords: string[];
  accountCode: string;
  accountName: string;
  taxCategory: TaxCategory;
  usageCount: number;
  lastUsed: string;
  approvedBy: string;
}

interface KnowledgeImprovement {
  id: string;
  type: "new_pattern" | "conflict_detected" | "threshold_adjustment";
  description: string;
  proposedPattern?: KnowledgePattern;
  conflictingPatterns?: [KnowledgePattern, KnowledgePattern];
  status: "proposed" | "approved" | "rejected";
  createdAt: string;
}

interface HookContext {
  transactionId: string;
  step: LifecycleStep;
  data: unknown;
  timestamp: string;
}

type LifecycleStep =
  | "extract"
  | "journal_generate"
  | "balance_check"
  | "account_validate"
  | "tax_verify"
  | "approval";

interface HookResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

interface AccountMaster {
  code: string;
  name: string;
  category: "asset" | "liability" | "equity" | "revenue" | "expense";
  taxDefault: TaxCategory;
}

export type {
  AccountMaster,
  CompletionChecklist,
  ExtractedTransaction,
  HookContext,
  HookResult,
  JournalEntry,
  JournalLine,
  JournalStatus,
  KnowledgeImprovement,
  KnowledgePattern,
  LifecycleStep,
  TaxCategory,
  TransactionInput,
};
