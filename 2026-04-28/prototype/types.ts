// ── 請求書（入力） ──

interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
}

interface Invoice {
  id: string;
  vendorName: string;
  vendorId?: string;
  invoiceDate: string;
  dueDate?: string;
  lineItems: InvoiceLineItem[];
  totalAmount: number;
  taxAmount: number;
  notes?: string;
}

// ── AI抽出結果 ──

interface ExtractedLineItem extends InvoiceLineItem {
  suggestedAccountCode: string;
  suggestedAccountName: string;
  confidence: number;
}

interface ExtractionResult {
  invoice: Invoice;
  extractedLines: ExtractedLineItem[];
  anomalies: Anomaly[];
}

interface Anomaly {
  type: "unusual_amount" | "new_vendor" | "duplicate_suspect" | "missing_field";
  severity: "info" | "warning" | "critical";
  message: string;
}

// ── 仕訳（出力） ──

interface JournalLine {
  accountCode: string;
  accountName: string;
  subAccountCode?: string;
  debit: number;
  credit: number;
  description: string;
}

interface JournalEntry {
  id: string;
  invoiceId: string;
  date: string;
  vendorName: string;
  lines: JournalLine[];
  totalDebit: number;
  totalCredit: number;
  status: "draft" | "pending_review" | "approved" | "rejected";
  requiresHumanReview: boolean;
  reviewReasons: string[];
  confidence: number;
}

// ── ナレッジ ──

interface VendorMapping {
  vendorName: string;
  aliases: string[];
  defaultAccountCode: string;
  defaultAccountName: string;
  paymentTermDays: number;
  lastUsed: string;
  correctionCount: number;
}

interface AccountMaster {
  code: string;
  name: string;
  category: "expense" | "asset" | "liability" | "revenue" | "equity";
  taxApplicable: boolean;
}

interface CorrectionRecord {
  invoiceId: string;
  vendorName: string;
  originalAccountCode: string;
  correctedAccountCode: string;
  correctedAccountName: string;
  timestamp: string;
}

interface ImprovementProposal {
  id: string;
  type: "add_vendor_mapping" | "update_default_account" | "add_alias";
  description: string;
  basedOn: CorrectionRecord[];
  proposedChange: Record<string, unknown>;
  status: "draft" | "approved" | "rejected";
  createdAt: string;
}

// ── ハーネス ──

interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
  validator: () => boolean;
}

interface Checklist {
  items: ChecklistItem[];
  allCompleted: () => boolean;
}

type HookPhase =
  | "before:extract"
  | "after:extract"
  | "before:classify"
  | "after:classify"
  | "after:journalize";

interface HookContext {
  invoice: Invoice;
  extractionResult?: ExtractionResult;
  journalEntry?: JournalEntry;
  vendorMappings: VendorMapping[];
  accountMaster: AccountMaster[];
  corrections: CorrectionRecord[];
}

interface HookResult {
  passed: boolean;
  messages: string[];
  enrichedContext?: Partial<HookContext>;
}

export type {
  AccountMaster,
  Anomaly,
  Checklist,
  ChecklistItem,
  CorrectionRecord,
  ExtractionResult,
  ExtractedLineItem,
  HookContext,
  HookPhase,
  HookResult,
  ImprovementProposal,
  Invoice,
  InvoiceLineItem,
  JournalEntry,
  JournalLine,
  VendorMapping,
};
