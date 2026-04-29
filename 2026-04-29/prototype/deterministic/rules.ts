import type { ExtractedData, JournalEntry, ValidationResult } from "../types.ts";

const ROUNDING_TOLERANCE = 1;
const PERCENT = 100;
const SUM_INITIAL = 0;

const TAX_RATES: Record<string, number> = {
  reduced: 0.08,
  standard: 0.1,
};

const ACCOUNT_MAP: Record<string, { code: string; name: string }> = {
  AWS: { code: "7310", name: "通信費" },
  クラウド: { code: "7310", name: "通信費" },
  コピー用紙: { code: "7500", name: "消耗品費" },
  コンサル: { code: "7100", name: "外注費" },
  コンサルティング: { code: "7100", name: "外注費" },
  サーバー: { code: "7310", name: "通信費" },
  システム: { code: "7100", name: "外注費" },
  セミナー: { code: "7700", name: "研修費" },
  ホスティング: { code: "7310", name: "通信費" },
  マーケティング: { code: "7400", name: "広告宣伝費" },
  メンテナンス: { code: "7100", name: "外注費" },
  事務用品: { code: "7500", name: "消耗品費" },
  交通: { code: "7600", name: "旅費交通費" },
  保守: { code: "7100", name: "外注費" },
  出張: { code: "7600", name: "旅費交通費" },
  家賃: { code: "7200", name: "地代家賃" },
  広告: { code: "7400", name: "広告宣伝費" },
  文房具: { code: "7500", name: "消耗品費" },
  研修: { code: "7700", name: "研修費" },
  賃料: { code: "7200", name: "地代家賃" },
  開発: { code: "7100", name: "外注費" },
};

const validateLineItems = (items: ExtractedData["items"]): ValidationResult["checks"] => {
  const checks: ValidationResult["checks"] = [];
  for (const item of items) {
    const expectedLineTotal = item.quantity * item.unitPrice;
    const lineTotalMatch = Math.abs(item.lineTotal - expectedLineTotal) < ROUNDING_TOLERANCE;
    checks.push({
      message: lineTotalMatch
        ? `OK: ${item.quantity} × ${item.unitPrice} = ${item.lineTotal}`
        : `NG: ${item.quantity} × ${item.unitPrice} = ${expectedLineTotal} (申告値: ${item.lineTotal})`,
      name: `明細行計算: ${item.description}`,
      passed: lineTotalMatch,
    });

    const expectedTax = Math.floor(item.lineTotal * item.taxRate);
    const taxMatch = Math.abs(item.taxAmount - expectedTax) < ROUNDING_TOLERANCE;
    checks.push({
      message: taxMatch
        ? `OK: ${item.lineTotal} × ${item.taxRate * PERCENT}% = ${item.taxAmount}`
        : `NG: 期待値 ${expectedTax}, 申告値 ${item.taxAmount}`,
      name: `消費税計算: ${item.description}`,
      passed: taxMatch,
    });
  }
  return checks;
};

const checkSubtotal = (extracted: ExtractedData): ValidationResult["checks"][number] => {
  const calculated = extracted.items.reduce((sum, item) => sum + item.lineTotal, SUM_INITIAL);
  const passed = Math.abs(extracted.subtotal - calculated) < ROUNDING_TOLERANCE;
  return {
    message: passed
      ? `OK: 小計 ${extracted.subtotal}`
      : `NG: 明細合計 ${calculated} ≠ 申告小計 ${extracted.subtotal}`,
    name: "小計整合性",
    passed,
  };
};

const checkTaxTotal = (extracted: ExtractedData): ValidationResult["checks"][number] => {
  const calculated = extracted.items.reduce((sum, item) => sum + item.taxAmount, SUM_INITIAL);
  const passed = Math.abs(extracted.taxAmount - calculated) < ROUNDING_TOLERANCE;
  return {
    message: passed
      ? `OK: 消費税合計 ${extracted.taxAmount}`
      : `NG: 明細税額合計 ${calculated} ≠ 申告税額 ${extracted.taxAmount}`,
    name: "消費税合計整合性",
    passed,
  };
};

const checkGrandTotal = (extracted: ExtractedData): ValidationResult["checks"][number] => {
  const calculated = extracted.subtotal + extracted.taxAmount;
  const passed = Math.abs(extracted.total - calculated) < ROUNDING_TOLERANCE;
  return {
    message: passed
      ? `OK: ${extracted.subtotal} + ${extracted.taxAmount} = ${extracted.total}`
      : `NG: ${extracted.subtotal} + ${extracted.taxAmount} = ${calculated} (申告値: ${extracted.total})`,
    name: "合計金額整合性",
    passed,
  };
};

const validateTotals = (extracted: ExtractedData): ValidationResult["checks"] => [
  checkSubtotal(extracted),
  checkTaxTotal(extracted),
  checkGrandTotal(extracted),
];

const validateNumericIntegrity = (extracted: ExtractedData): ValidationResult => {
  const checks = [...validateLineItems(extracted.items), ...validateTotals(extracted)];
  return {
    checks,
    passed: checks.every((ch) => ch.passed),
  };
};

const checkDuplicateInvoice = (invoiceId: string, processedIds: Set<string>): ValidationResult => {
  const isDuplicate = processedIds.has(invoiceId);
  return {
    checks: [
      {
        message: isDuplicate
          ? `NG: 請求書番号 ${invoiceId} は既に処理済みです`
          : `OK: 請求書番号 ${invoiceId} は未処理です`,
        name: "重複チェック",
        passed: !isDuplicate,
      },
    ],
    passed: !isDuplicate,
  };
};

const resolveAccountCode = (description: string): { code: string; name: string } | null => {
  for (const [keyword, account] of Object.entries(ACCOUNT_MAP)) {
    if (description.includes(keyword)) {
      return account;
    }
  }
  return null;
};

const calculateTax = (amount: number, rateKey: string): number => {
  const rate = TAX_RATES[rateKey] ?? TAX_RATES.standard;
  return Math.floor(amount * rate);
};

const validateDebitCreditBalance = (entry: JournalEntry): ValidationResult => {
  const debitTotal = entry.entries
    .filter((en) => en.side === "debit")
    .reduce((sum, en) => sum + en.amount, SUM_INITIAL);
  const creditTotal = entry.entries
    .filter((en) => en.side === "credit")
    .reduce((sum, en) => sum + en.amount, SUM_INITIAL);
  const balanced = Math.abs(debitTotal - creditTotal) < ROUNDING_TOLERANCE;

  return {
    checks: [
      {
        message: balanced
          ? `OK: 借方 ${debitTotal} = 貸方 ${creditTotal}`
          : `NG: 借方 ${debitTotal} ≠ 貸方 ${creditTotal}`,
        name: "貸借バランス",
        passed: balanced,
      },
    ],
    passed: balanced,
  };
};

const buildCsvRow = (
  je: JournalEntry,
  dr: JournalEntry["entries"][number] | undefined,
  cr: JournalEntry["entries"][number] | undefined,
): string =>
  [
    je.date,
    dr?.accountCode ?? "",
    dr?.accountName ?? "",
    dr?.amount?.toString() ?? "",
    cr?.accountCode ?? "",
    cr?.accountName ?? "",
    cr?.amount?.toString() ?? "",
    dr?.description ?? cr?.description ?? "",
  ].join(",");

const formatJournalCsv = (entries: JournalEntry[]): string => {
  const header = "日付,借方科目コード,借方科目名,借方金額,貸方科目コード,貸方科目名,貸方金額,摘要";
  const rows = entries.flatMap((je) => {
    const debits = je.entries.filter((en) => en.side === "debit");
    const credits = je.entries.filter((en) => en.side === "credit");
    const maxLen = Math.max(debits.length, credits.length);
    return Array.from({ length: maxLen }, (_unused, idx) =>
      buildCsvRow(je, debits[idx], credits[idx]),
    );
  });
  return [header, ...rows].join("\n");
};

export {
  TAX_RATES,
  ACCOUNT_MAP,
  ROUNDING_TOLERANCE,
  PERCENT,
  SUM_INITIAL,
  validateLineItems,
  validateTotals,
  validateNumericIntegrity,
  checkDuplicateInvoice,
  resolveAccountCode,
  calculateTax,
  validateDebitCreditBalance,
  formatJournalCsv,
};
