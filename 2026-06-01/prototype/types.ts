// InvoiceForge 共通型定義

interface RawInvoice {
  invoiceId: string;
  rawText: string;
  metadata: {
    receivedAt: string;
    source: string;
    fileType: string;
  };
}

interface ExtractedInvoice {
  invoiceId: string;
  vendor: string;
  invoiceDate: string;
  dueDate: string;
  items: InvoiceLineItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  bankInfo: string;
  invoiceNumber: string;
  confidence: number;
}

interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

interface PurchaseOrder {
  poId: string;
  vendor: string;
  vendorAliases: string[];
  items: {
    description: string;
    unitPrice: number | null;
    quantity: number | null;
    period: string;
  }[];
  totalAmount: number;
  taxRate: number;
  accountCode: string;
  accountName: string;
  notes?: string;
}

interface MatchResult {
  invoiceId: string;
  matchedPoId: string | null;
  matchConfidence: number;
  matchReason: string;
  amountDifference: number;
  needsHumanReview: boolean;
  reviewReason?: string;
}

interface JournalEntry {
  entryId: string;
  invoiceId: string;
  date: string;
  debit: { accountCode: string; accountName: string; amount: number };
  credit: { accountCode: string; accountName: string; amount: number };
  taxEntry?: {
    debit: { accountCode: string; accountName: string; amount: number };
    credit: { accountCode: string; accountName: string; amount: number };
  };
  description: string;
  confidence: number;
  status: "auto-approved" | "pending-review" | "human-approved" | "rejected";
}

interface ChecklistItem {
  id: string;
  description: string;
  completed: boolean;
  completedAt?: string;
  validationResult?: string;
}

interface HookResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

interface KnowledgeFeedback {
  invoiceId: string;
  field: string;
  originalValue: unknown;
  correctedValue: unknown;
  correctedBy: string;
  correctedAt: string;
}

interface ImprovementProposal {
  id: string;
  type: "vendor-alias" | "journal-pattern" | "validation-rule";
  description: string;
  evidence: KnowledgeFeedback[];
  status: "proposed" | "approved" | "rejected";
  proposedAt: string;
}

export type {
  ChecklistItem,
  ExtractedInvoice,
  HookResult,
  ImprovementProposal,
  InvoiceLineItem,
  JournalEntry,
  KnowledgeFeedback,
  MatchResult,
  PurchaseOrder,
  RawInvoice,
};
