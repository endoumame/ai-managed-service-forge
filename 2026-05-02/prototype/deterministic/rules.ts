/**
 * 決定論的コード層: ルールベース処理
 *
 * AIに任せない確定計算をここに集約する。
 * 消費税計算、貸借バランス検証、日付妥当性チェックなど、
 * ルールが明確で例外のない処理を決定論的に実行する。
 */
import type {
  AccountMaster,
  ChecklistItem,
  ExtractedData,
  ExtractedLineItem,
  JournalEntry,
  JournalLine,
} from "../types.ts";

const INITIAL_SUM = 0;
const EMPTY_COUNT = 0;
const PERCENTAGE_MULTIPLIER = 100;
const DECIMAL_PLACES_ONE = 1;
const TAX_RATE_REDUCED = 0.08;
const TAX_RATE_STANDARD = 0.1;
const TAX_RATES = new Set([TAX_RATE_REDUCED, TAX_RATE_STANDARD]);
const AMOUNT_DEVIATION_THRESHOLD = 0.5;

const calculateTax = (amount: number, taxRate: number): number => Math.floor(amount * taxRate);

const validateTaxRate = (rate: number): boolean => TAX_RATES.has(rate);

/** 抽出データから仕訳エントリを生成する */
const generateJournalEntry = (invoiceId: string, extracted: ExtractedData): JournalEntry => {
  const entries: JournalLine[] = [];

  for (const item of extracted.items) {
    const taxAmount = calculateTax(item.amount, item.taxRate);
    entries.push({
      account: item.suggestedAccount,
      credit: 0,
      debit: item.amount,
    });
    entries.push({
      account: "仮払消費税",
      credit: 0,
      debit: taxAmount,
    });
  }

  const totalDebit = entries.reduce((sum, entry) => sum + entry.debit, INITIAL_SUM);
  entries.push({
    account: "買掛金",
    credit: totalDebit,
    debit: 0,
  });

  return {
    date: extracted.invoiceDate,
    description: `${extracted.vendor} ${extracted.invoiceDate} 請求書`,
    entries,
    invoiceId,
    vendor: extracted.vendor,
  };
};

/** 貸借バランスを検証する（1円たりともズレを許さない） */
const validateDebitCreditBalance = (entry: JournalEntry): ChecklistItem => {
  const totalDebit = entry.entries.reduce((sum, line) => sum + line.debit, INITIAL_SUM);
  const totalCredit = entry.entries.reduce((sum, line) => sum + line.credit, INITIAL_SUM);
  const balanced = totalDebit === totalCredit;

  return {
    detail: balanced
      ? `借方合計=${totalDebit} 貸方合計=${totalCredit}`
      : `不一致: 借方=${totalDebit} 貸方=${totalCredit} 差額=${totalDebit - totalCredit}`,
    id: "debit-credit-balance",
    label: "貸借バランス一致",
    passed: balanced,
  };
};

/** 消費税率の妥当性を検証する */
const validateTaxRates = (items: ExtractedLineItem[]): ChecklistItem => {
  const invalidItems = items.filter((item) => !validateTaxRate(item.taxRate));
  const passed = invalidItems.length === EMPTY_COUNT;

  return {
    detail: passed
      ? `全${items.length}項目の税率が有効`
      : `無効な税率: ${invalidItems.map((item) => `${item.description}(${item.taxRate})`).join(", ")}`,
    id: "tax-rate-validity",
    label: "消費税率妥当性",
    passed,
  };
};

/** 消費税計算の整合性を検証する */
const validateTaxCalculation = (extracted: ExtractedData): ChecklistItem => {
  const calculatedTax = extracted.items.reduce(
    (sum, item) => sum + calculateTax(item.amount, item.taxRate),
    INITIAL_SUM,
  );
  const passed = calculatedTax === extracted.taxAmount;

  return {
    detail: passed
      ? `税額=${extracted.taxAmount}（検算一致）`
      : `申告税額=${extracted.taxAmount} 検算税額=${calculatedTax} 差額=${extracted.taxAmount - calculatedTax}`,
    id: "tax-calculation",
    label: "消費税計算整合性",
    passed,
  };
};

/** 金額の桁数異常を検知する（過去平均との乖離） */
const validateAmountDeviation = (
  totalAmount: number,
  vendorHistory: { averageAmount: number } | undefined,
): ChecklistItem => {
  if (!vendorHistory) {
    return {
      detail: "新規取引先のため比較対象なし",
      id: "amount-deviation",
      label: "金額乖離チェック",
      passed: true,
    };
  }

  const deviation =
    Math.abs(totalAmount - vendorHistory.averageAmount) / vendorHistory.averageAmount;
  const passed = deviation <= AMOUNT_DEVIATION_THRESHOLD;

  return {
    detail: passed
      ? `乖離率=${(deviation * PERCENTAGE_MULTIPLIER).toFixed(DECIMAL_PLACES_ONE)}%（閾値${AMOUNT_DEVIATION_THRESHOLD * PERCENTAGE_MULTIPLIER}%以内）`
      : `警告: 乖離率=${(deviation * PERCENTAGE_MULTIPLIER).toFixed(DECIMAL_PLACES_ONE)}%（閾値${AMOUNT_DEVIATION_THRESHOLD * PERCENTAGE_MULTIPLIER}%超過）平均=${vendorHistory.averageAmount} 今回=${totalAmount}`,
    id: "amount-deviation",
    label: "金額乖離チェック",
    passed,
  };
};

/** 勘定科目の存在を検証する */
const validateAccountExists = (
  items: ExtractedLineItem[],
  accountMaster: AccountMaster[],
): ChecklistItem => {
  const validNames = new Set(accountMaster.map((account) => account.name));
  const invalidItems = items.filter((item) => !validNames.has(item.suggestedAccount));
  const passed = invalidItems.length === EMPTY_COUNT;

  return {
    detail: passed
      ? `全${items.length}項目の勘定科目がマスタに存在`
      : `未登録科目: ${invalidItems.map((item) => item.suggestedAccount).join(", ")}`,
    id: "account-exists",
    label: "勘定科目存在チェック",
    passed,
  };
};

/** 日付の妥当性を検証する */
const validateDateValidity = (invoiceDate: string, dueDate: string): ChecklistItem => {
  const invoice = new Date(invoiceDate);
  const due = new Date(dueDate);
  const passed = due >= invoice;

  return {
    detail: passed
      ? `請求日=${invoiceDate} 支払期日=${dueDate}`
      : `異常: 支払期日(${dueDate})が請求日(${invoiceDate})より前`,
    id: "date-validity",
    label: "日付妥当性",
    passed,
  };
};

export {
  calculateTax,
  generateJournalEntry,
  validateAccountExists,
  validateAmountDeviation,
  validateDateValidity,
  validateDebitCreditBalance,
  validateTaxCalculation,
  validateTaxRates,
};
