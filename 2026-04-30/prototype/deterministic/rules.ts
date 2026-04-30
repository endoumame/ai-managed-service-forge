import type { AccountMaster, JournalEntry, JournalLine, TaxCategory } from "../types.js";

const ACCOUNT_MASTER: AccountMaster[] = [
  { category: "asset", code: "1100", name: "現金", taxDefault: "non_taxable" },
  { category: "asset", code: "1110", name: "普通預金", taxDefault: "non_taxable" },
  { category: "asset", code: "1300", name: "売掛金", taxDefault: "non_taxable" },
  { category: "liability", code: "2100", name: "買掛金", taxDefault: "non_taxable" },
  { category: "liability", code: "2110", name: "未払金", taxDefault: "non_taxable" },
  { category: "liability", code: "2300", name: "仮受消費税", taxDefault: "non_taxable" },
  { category: "asset", code: "1500", name: "仮払消費税", taxDefault: "non_taxable" },
  { category: "revenue", code: "4100", name: "売上高", taxDefault: "taxable_10" },
  { category: "expense", code: "5100", name: "仕入高", taxDefault: "taxable_10" },
  { category: "expense", code: "6100", name: "旅費交通費", taxDefault: "taxable_10" },
  { category: "expense", code: "6200", name: "通信費", taxDefault: "taxable_10" },
  { category: "expense", code: "6300", name: "消耗品費", taxDefault: "taxable_10" },
  { category: "expense", code: "6400", name: "接待交際費", taxDefault: "taxable_10" },
  { category: "expense", code: "6500", name: "会議費", taxDefault: "taxable_8" },
  { category: "expense", code: "6600", name: "福利厚生費", taxDefault: "taxable_10" },
  { category: "expense", code: "6700", name: "広告宣伝費", taxDefault: "taxable_10" },
  { category: "expense", code: "6800", name: "支払手数料", taxDefault: "taxable_10" },
  { category: "expense", code: "6900", name: "地代家賃", taxDefault: "taxable_10" },
  { category: "expense", code: "7000", name: "水道光熱費", taxDefault: "taxable_10" },
  { category: "expense", code: "7100", name: "租税公課", taxDefault: "non_taxable" },
  { category: "expense", code: "7200", name: "減価償却費", taxDefault: "non_taxable" },
  { category: "expense", code: "7500", name: "雑費", taxDefault: "taxable_10" },
  { category: "revenue", code: "8100", name: "受取利息", taxDefault: "non_taxable" },
  { category: "expense", code: "8200", name: "支払利息", taxDefault: "non_taxable" },
];

const TAX_RATES: Record<TaxCategory, number> = {
  exempt: 0,
  non_taxable: 0,
  tax_free_export: 0,
  taxable_10: 0.1,
  taxable_8: 0.08,
};

const REDUCE_INITIAL = 0;
const BALANCE_TOLERANCE = 1;
const TAX_BASE = 1;
const NO_TAX = 0;
const ISO_DATE_START = 0;
const ISO_DATE_END = 10;
const JOURNAL_SEQ_RANGE = 10_000;
const JOURNAL_SEQ_PAD = 4;
const APPROVAL_TIER_AUTO = 10_000;
const APPROVAL_TIER_STAFF = 100_000;
const APPROVAL_TIER_MANAGER = 1_000_000;
const FISCAL_YEAR_START_MONTH = 4;
const MONTH_OFFSET = 1;
const FISCAL_MONTH_OFFSET_CURRENT = 3;
const FISCAL_MONTH_OFFSET_PREV = 9;
const PREV_YEAR_OFFSET = 1;

const getAccountMaster = (): AccountMaster[] => ACCOUNT_MASTER;

const findAccount = (code: string): AccountMaster | undefined =>
  ACCOUNT_MASTER.find((acct) => acct.code === code);

const validateAccountCodes = (entry: JournalEntry): { valid: boolean; invalidCodes: string[] } => {
  const invalidCodes: string[] = [];
  for (const line of entry.lines) {
    if (!findAccount(line.accountCode)) {
      invalidCodes.push(line.accountCode);
    }
  }
  return { invalidCodes, valid: invalidCodes.length === REDUCE_INITIAL };
};

const checkBalance = (
  lines: JournalLine[],
): { balanced: boolean; debitTotal: number; creditTotal: number; difference: number } => {
  const debitTotal = lines.reduce((sum, line) => sum + line.debit, REDUCE_INITIAL);
  const creditTotal = lines.reduce((sum, line) => sum + line.credit, REDUCE_INITIAL);
  const difference = Math.abs(debitTotal - creditTotal);
  return {
    balanced: difference < BALANCE_TOLERANCE,
    creditTotal,
    debitTotal,
    difference,
  };
};

const calculateTax = (
  amount: number,
  taxCategory: TaxCategory,
): { taxExcluded: number; tax: number; taxIncluded: number } => {
  const rate = TAX_RATES[taxCategory];
  if (rate === NO_TAX) {
    return { tax: NO_TAX, taxExcluded: amount, taxIncluded: amount };
  }
  const taxExcluded = Math.floor(amount / (TAX_BASE + rate));
  const tax = amount - taxExcluded;
  return { tax, taxExcluded, taxIncluded: amount };
};

const determineTaxCategory = (accountCode: string): TaxCategory => {
  const account = findAccount(accountCode);
  return account?.taxDefault ?? "taxable_10";
};

const generateJournalId = (): string => {
  const now = new Date();
  const dateStr = now.toISOString().slice(ISO_DATE_START, ISO_DATE_END).replaceAll("-", "");
  const seq = String(Math.floor(Math.random() * JOURNAL_SEQ_RANGE)).padStart(JOURNAL_SEQ_PAD, "0");
  return `JE-${dateStr}-${seq}`;
};

const determineApprovalRoute = (
  totalAmount: number,
): { autoApprovable: boolean; requiredApprover: string } => {
  if (totalAmount <= APPROVAL_TIER_AUTO) {
    return { autoApprovable: true, requiredApprover: "system" };
  }
  if (totalAmount <= APPROVAL_TIER_STAFF) {
    return { autoApprovable: false, requiredApprover: "経理担当者" };
  }
  if (totalAmount <= APPROVAL_TIER_MANAGER) {
    return { autoApprovable: false, requiredApprover: "経理マネージャー" };
  }
  return { autoApprovable: false, requiredApprover: "CFO" };
};

const determineFiscalPeriod = (dateStr: string): { fiscalYear: number; fiscalMonth: number } => {
  const date = new Date(dateStr);
  const month = date.getMonth() + MONTH_OFFSET;
  const year = date.getFullYear();
  const fiscalYear = month >= FISCAL_YEAR_START_MONTH ? year : year - PREV_YEAR_OFFSET;
  const fiscalMonth =
    month >= FISCAL_YEAR_START_MONTH
      ? month - FISCAL_MONTH_OFFSET_CURRENT
      : month + FISCAL_MONTH_OFFSET_PREV;
  return { fiscalMonth, fiscalYear };
};

export {
  calculateTax,
  checkBalance,
  determineApprovalRoute,
  determineFiscalPeriod,
  determineTaxCategory,
  findAccount,
  generateJournalId,
  getAccountMaster,
  validateAccountCodes,
};
