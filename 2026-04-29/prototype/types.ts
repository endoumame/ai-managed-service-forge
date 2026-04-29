interface RawInvoice {
  id: string;
  vendor: string;
  text: string;
  date: string;
  items: {
    description: string;
    quantity: number;
    unitPrice: number;
    taxRate: number;
  }[];
  subtotal: number;
  taxAmount: number;
  total: number;
}

interface ExtractedData {
  invoiceId: string;
  vendorName: string;
  vendorNameNormalized: string;
  date: string;
  items: {
    description: string;
    quantity: number;
    unitPrice: number;
    taxRate: number;
    lineTotal: number;
    taxAmount: number;
  }[];
  subtotal: number;
  taxAmount: number;
  total: number;
  confidence: number;
}

interface ValidationResult {
  passed: boolean;
  checks: {
    name: string;
    passed: boolean;
    message: string;
  }[];
}

interface JournalEntry {
  invoiceId: string;
  date: string;
  entries: {
    side: "debit" | "credit";
    accountCode: string;
    accountName: string;
    amount: number;
    description: string;
  }[];
  confidence: number;
  reasoning: string;
}

interface ApprovalRequest {
  type: "journal_entry" | "new_vendor" | "anomaly";
  invoiceId: string;
  description: string;
  data: JournalEntry | ExtractedData;
  reasons: string[];
}

interface ApprovalResult {
  approved: boolean;
  modified: boolean;
  corrections?: Record<string, unknown>;
  reason?: string;
}

interface KnowledgeEntry {
  vendorName: string;
  patterns: {
    itemKeyword: string;
    accountCode: string;
    accountName: string;
    frequency: number;
  }[];
  lastUpdated: string;
}

interface ImprovementProposal {
  type: "new_rule" | "update_rule" | "new_vendor";
  description: string;
  evidence: string;
  proposedChange: Record<string, unknown>;
}

type LifecycleHook = (data: unknown) => Promise<ValidationResult>;

interface CompletionChecklist {
  allInvoicesExtracted: boolean;
  noNumericDiscrepancies: boolean;
  allJournalsAssigned: boolean;
  debitCreditBalanced: boolean;
  highRiskFlagged: boolean;
}

export type {
  RawInvoice,
  ExtractedData,
  ValidationResult,
  JournalEntry,
  ApprovalRequest,
  ApprovalResult,
  KnowledgeEntry,
  ImprovementProposal,
  LifecycleHook,
  CompletionChecklist,
};
