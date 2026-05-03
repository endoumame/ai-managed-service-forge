// InvoiceGuard 共通型定義

interface RawInvoice {
  id: string;
  vendor: string;
  invoiceNumber: string;
  date: string;
  dueDate: string;
  items: RawInvoiceItem[];
  totalAmount: number;
  taxAmount: number;
  notes?: string;
}

interface RawInvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  amount: number;
}

interface ExtractedData {
  invoiceId: string;
  vendorName: string;
  vendorNormalized: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  items: ExtractedItem[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  confidence: number;
}

interface ExtractedItem {
  description: string;
  accountCode: string;
  accountName: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  amount: number;
  confidence: number;
}

interface JournalEntry {
  invoiceId: string;
  date: string;
  entries: JournalLine[];
  memo: string;
}

interface JournalLine {
  side: "debit" | "credit";
  accountCode: string;
  accountName: string;
  amount: number;
  taxAmount?: number;
}

type CheckStatus = "pending" | "passed" | "failed" | "skipped";

interface ChecklistItem {
  id: string;
  name: string;
  status: CheckStatus;
  message?: string;
  timestamp?: string;
}

interface InvoiceChecklist {
  invoiceId: string;
  items: ChecklistItem[];
}

interface QualityCheckResult {
  passed: boolean;
  checks: ChecklistItem[];
  requiresHumanReview: boolean;
  humanReviewReasons: string[];
}

interface KnowledgeEntry {
  vendorName: string;
  pattern: {
    itemKeywords: string[];
    accountCode: string;
    accountName: string;
    typicalTaxRate: number;
  };
  usageCount: number;
  lastUsed: string;
  source: "initial" | "human_correction" | "auto_learned";
}

interface ImprovementProposal {
  id: string;
  type: "new_pattern" | "update_pattern" | "remove_pattern";
  description: string;
  vendorName: string;
  before?: KnowledgeEntry;
  after?: KnowledgeEntry;
  evidence: string[];
  createdAt: string;
  status: "pending" | "approved" | "rejected";
}

interface ProcessingResult {
  invoiceId: string;
  extracted: ExtractedData;
  journal: JournalEntry;
  quality: QualityCheckResult;
  checklist: InvoiceChecklist;
  status: "completed" | "needs_review" | "failed";
}

interface HarnessConfig {
  confidenceThreshold: number;
  highValueThreshold: number;
  anomalyDeviationPercent: number;
  maxProcessingTimeMs: number;
}

const DEFAULT_CONFIG: HarnessConfig = {
  anomalyDeviationPercent: 30,
  confidenceThreshold: 0.8,
  highValueThreshold: 1_000_000,
  maxProcessingTimeMs: 30_000,
};

export {
  DEFAULT_CONFIG,
  type ChecklistItem,
  type CheckStatus,
  type ExtractedData,
  type ExtractedItem,
  type HarnessConfig,
  type ImprovementProposal,
  type InvoiceChecklist,
  type JournalEntry,
  type JournalLine,
  type KnowledgeEntry,
  type ProcessingResult,
  type QualityCheckResult,
  type RawInvoice,
  type RawInvoiceItem,
};
