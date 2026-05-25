/* eslint-disable no-magic-numbers, require-await, max-statements, max-lines-per-function, id-length, no-console, no-undefined, no-await-in-loop, no-use-before-define, sort-imports, max-params, unicorn/consistent-function-scoping, unicorn/prefer-top-level-await, unicorn/no-array-callback-reference, import/no-nodejs-modules, import/no-duplicates, typescript/no-unsafe-member-access, typescript/no-unsafe-call, typescript/no-unsafe-assignment, typescript/no-unsafe-argument, typescript/no-unsafe-type-assertion, typescript/no-non-null-assertion, typescript/explicit-function-return-type, typescript/require-await, typescript/strict-boolean-expressions, prefer-destructuring */
// InvoiceForge 共通型定義

interface InvoiceInput {
  rawText: string;
  fileName?: string;
}

interface ExtractedInvoice {
  vendorName: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;
  items: InvoiceLineItem[];
  subtotal: number;
  taxAmount: number;
  taxRate: number;
  totalAmount: number;
  qualifiedInvoiceNumber?: string;
}

interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

interface JournalEntry {
  date: string;
  debitAccount: string;
  debitAmount: number;
  creditAccount: string;
  creditAmount: number;
  description: string;
  vendorName: string;
  confidence: number;
}

interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

interface ValidationError {
  field: string;
  message: string;
  expected?: string | number;
  actual?: string | number;
}

interface ValidationWarning {
  field: string;
  message: string;
}

interface CompletionChecklist {
  allFieldsExtracted: boolean;
  amountsConsistent: boolean;
  accountCodeValid: boolean;
  journalBalanced: boolean;
}

interface KnowledgeEntry {
  vendorName: string;
  accountCode: string;
  accountName: string;
  frequency: number;
  lastUsed: string;
  approvedBy?: string;
}

interface KnowledgeStore {
  entries: KnowledgeEntry[];
  improvements: ImprovementProposal[];
}

interface ImprovementProposal {
  id: string;
  type: "new_mapping" | "conflict_resolution" | "pattern_update";
  vendorName: string;
  currentMapping?: string;
  proposedMapping: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

interface HarnessContext {
  invoice: InvoiceInput;
  extracted?: ExtractedInvoice;
  journal?: JournalEntry;
  validation?: ValidationResult;
  checklist: CompletionChecklist;
  knowledgeHints: KnowledgeEntry[];
  humanReviewRequired: boolean;
  humanReviewReasons: string[];
}

type LifecycleHook = (ctx: HarnessContext) => Promise<HarnessContext>;

export type {
  InvoiceInput,
  ExtractedInvoice,
  InvoiceLineItem,
  JournalEntry,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  CompletionChecklist,
  KnowledgeEntry,
  KnowledgeStore,
  ImprovementProposal,
  HarnessContext,
  LifecycleHook,
};
