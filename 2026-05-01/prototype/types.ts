interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  taxRate: number;
}

interface ExtractedInvoiceData {
  vendorName: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string | null;
  items: InvoiceItem[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
}

interface JournalLine {
  accountCode: string;
  accountName: string;
  amount: number;
}

interface JournalEntry {
  debitEntries: JournalLine[];
  creditEntries: JournalLine[];
  description: string;
  confidence: number;
}

interface Invoice {
  id: string;
  rawText: string;
  extractedData: ExtractedInvoiceData | null;
  journalEntry: JournalEntry | null;
  status:
    | "pending"
    | "extracted"
    | "classified"
    | "validated"
    | "awaiting_approval"
    | "approved"
    | "rejected"
    | "corrected";
  validationErrors: string[];
  anomalies: string[];
}

interface CompletionChecklist {
  allFieldsExtracted: boolean;
  accountCodeAssigned: boolean;
  debitCreditBalanced: boolean;
  taxConsistent: boolean;
  approvalQueueSubmitted: boolean;
}

interface AccountMapping {
  vendorName: string;
  itemPattern: string;
  accountCode: string;
  accountName: string;
  usageCount: number;
  source: "manual" | "ai_learned" | "rule_promoted";
}

interface CorrectionRecord {
  invoiceId: string;
  timestamp: string;
  originalAccountCode: string;
  correctedAccountCode: string;
  correctedAccountName: string;
  vendorName: string;
  itemDescription: string;
}

interface KnowledgeBase {
  accountMappings: AccountMapping[];
  correctionHistory: CorrectionRecord[];
  processedCount: number;
}

type HookPhase =
  | "beforeExtract"
  | "afterExtract"
  | "beforeClassify"
  | "afterClassify"
  | "beforeApprove";

interface HookResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
  context?: Record<string, unknown>;
}

export type {
  AccountMapping,
  CompletionChecklist,
  CorrectionRecord,
  ExtractedInvoiceData,
  HookPhase,
  HookResult,
  Invoice,
  InvoiceItem,
  JournalEntry,
  JournalLine,
  KnowledgeBase,
};
