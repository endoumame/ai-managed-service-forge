import type { ExtractedData, ExtractedItem, JournalEntry } from "../types.ts";

const TAX_RATE_10 = 0.1;
const TAX_RATE_8 = 0.08;
const TOLERANCE = 0.001;
const INVOICE_NUMBER_REGEX = /^T\d{13}$/;

type TaxCategory = "taxable_10" | "taxable_8" | "exempt";

const determineTaxCategory = (rate: number): TaxCategory => {
  if (Math.abs(rate - TAX_RATE_10) < TOLERANCE) {
    return "taxable_10";
  }
  if (Math.abs(rate - TAX_RATE_8) < TOLERANCE) {
    return "taxable_8";
  }
  return "exempt";
};

const calculateTax = (amount: number, rate: number): number => Math.round(amount * rate);

const validateInvoiceNumberFormat = (invoiceNumber: string): boolean =>
  INVOICE_NUMBER_REGEX.test(invoiceNumber);

const buildJournalEntry = (
  item: ExtractedItem,
  date: string,
  creditAccount: string,
): JournalEntry => {
  const taxCategory = determineTaxCategory(item.taxRate);
  const taxAmount = calculateTax(item.amount, item.taxRate);
  const totalWithTax = item.amount + taxAmount;

  return {
    creditAccount,
    creditAmount: totalWithTax,
    date,
    debitAccount: item.suggestedCategory,
    debitAmount: totalWithTax,
    description: item.description,
    taxCategory,
  };
};

const buildJournalEntries = (extracted: ExtractedData, creditAccount: string): JournalEntry[] => {
  const entries: JournalEntry[] = [];
  for (const item of extracted.items) {
    entries.push(buildJournalEntry(item, extracted.issueDate, creditAccount));
  }
  return entries;
};

const detectDuplicate = (invoiceNumber: string, existingNumbers: Set<string>): boolean =>
  existingNumbers.has(invoiceNumber);

export {
  buildJournalEntries,
  calculateTax,
  detectDuplicate,
  determineTaxCategory,
  validateInvoiceNumberFormat,
};
