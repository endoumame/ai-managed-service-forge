/* eslint-disable no-magic-numbers, no-undefined, no-void, typescript/strict-boolean-expressions -- Prototype: business rule constants and type guards */
/**
 * ルールベース処理レイヤー
 *
 * なぜこの実装か:
 * 請求書処理の中で「AIに任せてはいけない」部分を決定論的に処理する。
 * 税計算・仕訳生成・承認ルーティングは法律やビジネスルールに基づき、
 * AIの判断に依存せず常に同じ結果を返す必要がある。
 */

interface InvoiceItem {
  name: string;
  amount: number;
  quantity?: number;
  unitPrice?: number;
}

interface ExtractedInvoice {
  vendorName: string;
  invoiceDate: string;
  totalAmount: number;
  items: InvoiceItem[];
  invoiceNumber?: string;
  taxRate?: number;
}

interface JournalEntry {
  date: string;
  debitAccountCode: string;
  debitAccountName: string;
  debitAmount: number;
  creditAccountCode: string;
  creditAccountName: string;
  creditAmount: number;
  description: string;
  vendorName: string;
}

interface ApprovalResult {
  level: string;
  approver: string;
  reason: string;
}

interface AccountMapping {
  accountCode: string;
  accountName: string;
}

/* ----- 定数 ----- */

const STANDARD_TAX_RATE = 0.1;
const REDUCED_TAX_RATE = 0.08;
const TAX_PRECISION = 100;
const THRESHOLD_MANAGER = 100_000;
const THRESHOLD_DIRECTOR = 500_000;
const THRESHOLD_EXECUTIVE = 1_000_000;
const DEFAULT_CREDIT_CODE = "200";
const DEFAULT_DEBIT_CODE = "630";

const ACCOUNT_CODE_MAP: Record<string, AccountMapping> = {
  クラウドサーバー: { accountCode: "540", accountName: "通信費" },
  コピー用紙: { accountCode: "630", accountName: "消耗品費" },
  コンサルティング: { accountCode: "620", accountName: "支払手数料" },
  ソフトウェアライセンス: { accountCode: "550", accountName: "ソフトウェア費" },
  事務用品: { accountCode: "630", accountName: "消耗品費" },
  交通費: { accountCode: "520", accountName: "旅費交通費" },
  広告: { accountCode: "610", accountName: "広告宣伝費" },
  通信費: { accountCode: "540", accountName: "通信費" },
  配送料: { accountCode: "640", accountName: "荷造運賃" },
};

/* ----- 税計算 ----- */

const calculateTaxAmount = (baseAmount: number, isReduced: boolean): number => {
  const rate = isReduced ? REDUCED_TAX_RATE : STANDARD_TAX_RATE;
  return Math.round(baseAmount * rate * TAX_PRECISION) / TAX_PRECISION;
};

const calculateTotalWithTax = (baseAmount: number, isReduced: boolean): number => {
  const taxAmount = calculateTaxAmount(baseAmount, isReduced);
  return baseAmount + taxAmount;
};

/* ----- 勘定科目マッピング ----- */

const DEFAULT_MAPPING: AccountMapping = {
  accountCode: DEFAULT_DEBIT_CODE,
  accountName: "消耗品費",
};

const lookupAccountCode = (itemName: string): AccountMapping => {
  const matchKey = Object.keys(ACCOUNT_CODE_MAP).find((key) => itemName.includes(key));
  if (typeof matchKey !== "string") {
    return DEFAULT_MAPPING;
  }
  return ACCOUNT_CODE_MAP[matchKey] ?? DEFAULT_MAPPING;
};

/* ----- 仕訳生成 ----- */

const buildDescription = (invoice: ExtractedInvoice): string => {
  const itemNames = invoice.items.map((item) => item.name).join("・");
  return `${invoice.vendorName} ${itemNames}`;
};

const EMPTY_LENGTH = 0;

const resolveDebitAccount = (invoice: ExtractedInvoice): AccountMapping => {
  if (invoice.items.length === EMPTY_LENGTH) {
    return DEFAULT_MAPPING;
  }
  const [firstItem] = invoice.items;
  // eslint-disable-next-line typescript/no-unsafe-type-assertion -- Length check above guarantees firstItem exists
  return lookupAccountCode(firstItem.name);
};

const createJournalEntry = (invoice: ExtractedInvoice): JournalEntry => {
  const debitAccount = resolveDebitAccount(invoice);
  return {
    creditAccountCode: DEFAULT_CREDIT_CODE,
    creditAccountName: "買掛金",
    creditAmount: invoice.totalAmount,
    date: invoice.invoiceDate,
    debitAccountCode: debitAccount.accountCode,
    debitAccountName: debitAccount.accountName,
    debitAmount: invoice.totalAmount,
    description: buildDescription(invoice),
    vendorName: invoice.vendorName,
  };
};

/* ----- 承認ルーティング ----- */

const determineApprovalLevel = (amount: number): ApprovalResult => {
  if (amount >= THRESHOLD_EXECUTIVE) {
    return {
      approver: "役員",
      level: "executive",
      reason: `金額 ${amount.toLocaleString()}円 は${THRESHOLD_EXECUTIVE.toLocaleString()}円以上のため役員承認が必要`,
    };
  }
  if (amount >= THRESHOLD_DIRECTOR) {
    return {
      approver: "部長",
      level: "director",
      reason: `金額 ${amount.toLocaleString()}円 は${THRESHOLD_DIRECTOR.toLocaleString()}円以上のため部長承認が必要`,
    };
  }
  if (amount >= THRESHOLD_MANAGER) {
    return {
      approver: "課長",
      level: "manager",
      reason: `金額 ${amount.toLocaleString()}円 は${THRESHOLD_MANAGER.toLocaleString()}円以上のため課長承認が必要`,
    };
  }
  return {
    approver: "担当者",
    level: "staff",
    reason: `金額 ${amount.toLocaleString()}円 は${THRESHOLD_MANAGER.toLocaleString()}円未満のため担当者レベルで承認可能`,
  };
};

/* ----- 重複検出 ----- */

interface DuplicateCheckResult {
  isDuplicate: boolean;
  reason: string;
}

const checkDuplicateInvoice = (
  invoice: ExtractedInvoice,
  existing: ExtractedInvoice[],
): DuplicateCheckResult => {
  const duplicate = existing.find(
    (ex) =>
      ex.vendorName === invoice.vendorName &&
      ex.invoiceDate === invoice.invoiceDate &&
      ex.totalAmount === invoice.totalAmount,
  );
  if (duplicate) {
    return {
      isDuplicate: true,
      reason: `同一取引先・日付・金額の請求書が既に存在します（${duplicate.vendorName} / ${duplicate.invoiceDate}）`,
    };
  }
  return { isDuplicate: false, reason: "重複なし" };
};

export {
  calculateTaxAmount,
  calculateTotalWithTax,
  checkDuplicateInvoice,
  createJournalEntry,
  determineApprovalLevel,
  lookupAccountCode,
};
export type {
  AccountMapping,
  ApprovalResult,
  DuplicateCheckResult,
  ExtractedInvoice,
  InvoiceItem,
  JournalEntry,
};
