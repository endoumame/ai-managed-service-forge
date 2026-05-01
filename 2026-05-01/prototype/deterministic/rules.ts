import type { ExtractedInvoiceData, JournalEntry, JournalLine } from "../types.ts";

// oxlint-disable eslint(no-magic-numbers) -- 会計処理では税率・勘定科目コードなどの数値定数が本質的に必要

// 決定論的コード層: ルールベースで確実に実行する処理
// AIに任せてはいけない計算処理をここに集約する

const STANDARD_TAX_RATE = 0.1;
const ROUNDING_TOLERANCE = 1;

interface AccountRule {
  pattern: RegExp;
  accountCode: string;
  accountName: string;
}

const DEBIT_ACCOUNT_RULES: AccountRule[] = [
  { accountCode: "4310", accountName: "通信費", pattern: /サーバー|クラウド|ホスティング/ },
  { accountCode: "4310", accountName: "通信費", pattern: /SSL|証明書|ドメイン/ },
  { accountCode: "4320", accountName: "支払手数料", pattern: /サポート|保守|メンテナンス/ },
  { accountCode: "4350", accountName: "業務委託費", pattern: /コンサルティング|コンサル|顧問/ },
  { accountCode: "4350", accountName: "業務委託費", pattern: /調査|レポート|リサーチ/ },
  {
    accountCode: "4110",
    accountName: "消耗品費",
    pattern: /コピー用紙|トナー|文具|ペン|ボールペン|インク/,
  },
  { accountCode: "4110", accountName: "消耗品費", pattern: /オフィス|事務/ },
  { accountCode: "4410", accountName: "広告宣伝費", pattern: /広告|宣伝|マーケティング/ },
  { accountCode: "4210", accountName: "旅費交通費", pattern: /交通|タクシー|電車|新幹線/ },
  { accountCode: "4220", accountName: "接待交際費", pattern: /接待|飲食|会食/ },
];

const DEFAULT_DEBIT_ACCOUNT: JournalLine = {
  accountCode: "4900",
  accountName: "雑費",
  amount: 0,
};

const CREDIT_ACCOUNT_PAYABLE: JournalLine = {
  accountCode: "2100",
  accountName: "買掛金",
  amount: 0,
};

const classifyAccount = (description: string): JournalLine => {
  for (const rule of DEBIT_ACCOUNT_RULES) {
    if (rule.pattern.test(description)) {
      return { accountCode: rule.accountCode, accountName: rule.accountName, amount: 0 };
    }
  }
  return { ...DEFAULT_DEBIT_ACCOUNT };
};

const calculateTax = (subtotal: number): number => Math.floor(subtotal * STANDARD_TAX_RATE);

const validateTax = (subtotal: number, claimedTax: number): boolean =>
  Math.abs(calculateTax(subtotal) - claimedTax) <= ROUNDING_TOLERANCE;

const calculateConfidence = (
  extracted: ExtractedInvoiceData,
  debitEntries: JournalLine[],
): number => {
  let score = 1;

  const hasDefaultAccount = debitEntries.some(
    (de) => de.accountCode === DEFAULT_DEBIT_ACCOUNT.accountCode,
  );
  if (hasDefaultAccount) {
    score -= 0.3;
  }

  if (!validateTax(extracted.subtotal, extracted.taxAmount)) {
    score -= 0.2;
  }

  return Math.max(0, score);
};

const buildDebitEntries = (
  extracted: ExtractedInvoiceData,
  overrideAccounts?: Map<string, JournalLine>,
): JournalLine[] =>
  extracted.items.map((item) => {
    const override = overrideAccounts?.get(item.description);
    const account = override ?? classifyAccount(item.description);
    return { ...account, amount: item.amount };
  });

const buildJournalEntry = (
  extracted: ExtractedInvoiceData,
  overrideAccounts?: Map<string, JournalLine>,
): JournalEntry => {
  const debitEntries = buildDebitEntries(extracted, overrideAccounts);
  const taxDebit: JournalLine = {
    accountCode: "1500",
    accountName: "仮払消費税",
    amount: extracted.taxAmount,
  };
  const allDebits = [...debitEntries, taxDebit];
  const totalDebit = allDebits.reduce((sum, de) => sum + de.amount, 0);

  return {
    confidence: calculateConfidence(extracted, debitEntries),
    creditEntries: [{ ...CREDIT_ACCOUNT_PAYABLE, amount: totalDebit }],
    debitEntries: allDebits,
    description: `${extracted.vendorName} ${extracted.invoiceNumber} (${extracted.invoiceDate})`,
  };
};

const checkDuplicate = (
  invoiceNumber: string,
  vendorName: string,
  processedInvoices: { invoiceNumber: string; vendorName: string }[],
): boolean =>
  processedInvoices.some(
    (inv) => inv.invoiceNumber === invoiceNumber && inv.vendorName === vendorName,
  );

export { buildJournalEntry, calculateTax, checkDuplicate, classifyAccount, validateTax };
