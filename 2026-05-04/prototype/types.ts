interface InvoiceInput {
  invoiceId: string;
  vendorName: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  items: InvoiceItem[];
  totalAmount: number;
  taxAmount: number;
  currency: string;
}

interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  amount: number;
}

interface ExtractedData {
  vendorName: string;
  normalizedVendorName: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  items: ExtractedItem[];
  totalAmount: number;
  taxAmount: number;
  qualifiedInvoiceNumber: string | null;
}

interface ExtractedItem {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  amount: number;
  suggestedCategory: string;
}

interface JournalEntry {
  date: string;
  debitAccount: string;
  debitAmount: number;
  creditAccount: string;
  creditAmount: number;
  description: string;
  taxCategory: "taxable_10" | "taxable_8" | "exempt";
}

interface JournalCandidate {
  invoiceId: string;
  entries: JournalEntry[];
  confidenceScore: number;
  reasoning: string;
  needsHumanReview: boolean;
  reviewReasons: string[];
}

interface KnowledgeRule {
  id: string;
  vendorPattern: string;
  itemPattern: string;
  accountCode: string;
  accountName: string;
  frequency: number;
  lastUsed: string;
  approvedBy: string | null;
  status: "proposed" | "approved" | "rejected";
}

interface KnowledgeStore {
  rules: KnowledgeRule[];
  vendorAliases: Record<string, string>;
  averageAmounts: Record<string, { mean: number; stddev: number; count: number }>;
}

interface CompletionCondition {
  id: string;
  description: string;
  checker: (context: PipelineContext) => boolean;
  satisfied: boolean;
}

interface PipelineContext {
  invoice: InvoiceInput;
  extractedData: ExtractedData | null;
  journalCandidate: JournalCandidate | null;
  knowledge: KnowledgeStore;
  validationErrors: string[];
  warnings: string[];
}

type HookPhase =
  | "beforeExtract"
  | "afterExtract"
  | "beforeClassify"
  | "afterClassify"
  | "beforeCommit";

type HookFn = (context: PipelineContext) => PipelineContext | Promise<PipelineContext>;

export type {
  CompletionCondition,
  ExtractedData,
  ExtractedItem,
  HookFn,
  HookPhase,
  InvoiceInput,
  InvoiceItem,
  JournalCandidate,
  JournalEntry,
  KnowledgeRule,
  KnowledgeStore,
  PipelineContext,
};
