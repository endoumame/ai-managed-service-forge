/**
 * 決定論的コード層 — ルールベース処理
 *
 * なぜAIに任せないか:
 * 税計算・貸借バランス・科目マスタ照合は「正解が1つに決まる」処理。
 * AIに推論させると誤る可能性があるが、ルールベースなら100%正確。
 * これが「AIマネージドサービス」の決定論的コード層の存在意義。
 */

/* eslint-disable no-magic-numbers, max-statements, id-length, sort-imports, typescript-eslint/strict-boolean-expressions, typescript-eslint/no-unsafe-type-assertion */

import type {
  JournalEntry,
  ParsedInvoice,
  ValidationError,
  ValidationResult,
} from "../types/index.js";

// ── 勘定科目マスタ ──

/** 標準勘定科目マスタ（中小企業向け） */
const ACCOUNT_MASTER: Record<
  string,
  { name: string; category: "expense" | "asset" | "liability" | "revenue" }
> = {
  "2110": { category: "liability", name: "買掛金" },
  "2120": { category: "liability", name: "未払金" },
  "2130": { category: "liability", name: "未払消費税" },
  "2140": { category: "asset", name: "仮払消費税" },
  "5110": { category: "expense", name: "仕入高" },
  "6110": { category: "expense", name: "通信費" },
  "6120": { category: "expense", name: "消耗品費" },
  "6130": { category: "expense", name: "水道光熱費" },
  "6140": { category: "expense", name: "旅費交通費" },
  "6150": { category: "expense", name: "接待交際費" },
  "6160": { category: "expense", name: "広告宣伝費" },
  "6170": { category: "expense", name: "業務委託費" },
  "6180": { category: "expense", name: "地代家賃" },
  "6190": { category: "expense", name: "保険料" },
  "6200": { category: "expense", name: "支払手数料" },
  "6210": { category: "expense", name: "修繕費" },
  "6220": { category: "expense", name: "雑費" },
  "6230": { category: "expense", name: "リース料" },
  "6240": { category: "expense", name: "研修費" },
  "6250": { category: "expense", name: "新聞図書費" },
};

// ── 取引先→デフォルト科目のルールマスタ ──

const VENDOR_DEFAULT_ACCOUNTS: Record<string, { accountCode: string; accountName: string }> = {};

/**
 * 消費税額を検証する
 * ルール: 税抜金額 × 税率 = 税額（1円未満切捨て）
 */
const validateTaxCalculation = (invoice: ParsedInvoice): ValidationResult => {
  const errors: ValidationError[] = [];
  const expectedTax = Math.floor(invoice.subtotal * invoice.taxRate);

  if (Math.abs(expectedTax - invoice.taxAmount) > 1) {
    errors.push({
      field: "taxAmount",
      message: `税額不一致: 期待値 ¥${expectedTax}（税抜 ¥${invoice.subtotal} × ${invoice.taxRate * 100}%）, 実際 ¥${invoice.taxAmount}`,
      severity: "error",
    });
  }

  const expectedTotal = invoice.subtotal + invoice.taxAmount;
  if (Math.abs(expectedTotal - invoice.totalAmount) > 1) {
    errors.push({
      field: "totalAmount",
      message: `合計金額不一致: 税抜 ¥${invoice.subtotal} + 税額 ¥${invoice.taxAmount} = ¥${expectedTotal}, 記載合計 ¥${invoice.totalAmount}`,
      severity: "error",
    });
  }

  // 明細合計と小計の一致チェック
  const lineItemTotal = invoice.lineItems.reduce((sum, item) => sum + item.amount, 0);
  if (Math.abs(lineItemTotal - invoice.subtotal) > 1) {
    errors.push({
      field: "subtotal",
      message: `明細合計不一致: 明細合計 ¥${lineItemTotal}, 記載小計 ¥${invoice.subtotal}`,
      severity: "error",
    });
  }

  return { errors, valid: errors.length === 0 };
};

/**
 * 仕訳の貸借バランスを検証する
 * ルール: 借方合計 === 貸方合計（1円の誤差も許さない）
 */
const validateDebitCreditBalance = (journal: JournalEntry): ValidationResult => {
  const errors: ValidationError[] = [];

  const totalDebit = journal.entries.reduce((sum, entry) => sum + entry.debit, 0);
  const totalCredit = journal.entries.reduce((sum, entry) => sum + entry.credit, 0);

  if (totalDebit !== totalCredit) {
    errors.push({
      field: "balance",
      message: `貸借不一致: 借方合計 ¥${totalDebit} ≠ 貸方合計 ¥${totalCredit}（差額: ¥${Math.abs(totalDebit - totalCredit)}）`,
      severity: "error",
    });
  }

  // 各行が借方か貸方のいずれか一方のみ設定されているかチェック
  for (const [idx, entry] of journal.entries.entries()) {
    if (entry.debit > 0 && entry.credit > 0) {
      errors.push({
        field: `entries[${idx}]`,
        message: `仕訳行${i + 1}: 借方と貸方の両方に金額が設定されています`,
        severity: "error",
      });
    }
    if (entry.debit === 0 && entry.credit === 0) {
      errors.push({
        field: `entries[${idx}]`,
        message: `仕訳行${i + 1}: 借方も貸方も0円です`,
        severity: "warning",
      });
    }
  }

  return { errors, valid: errors.length === 0 };
};

/**
 * 勘定科目コードがマスタに存在するか検証する
 */
const validateAccountCodes = (journal: JournalEntry): ValidationResult => {
  const errors: ValidationError[] = [];

  for (const [idx, entry] of journal.entries.entries()) {
    if (!ACCOUNT_MASTER[entry.accountCode]) {
      errors.push({
        field: `entries[${idx}].accountCode`,
        message: `仕訳行${i + 1}: 勘定科目コード "${entry.accountCode}" がマスタに存在しません`,
        severity: "error",
      });
    }
  }

  return { errors, valid: errors.length === 0 };
};

/**
 * 仕訳データをCSV形式に変換する
 * 会計ソフトインポート用の標準フォーマット
 */
const journalToCSV = (journal: JournalEntry): string => {
  const header = "日付,勘定科目コード,勘定科目名,借方金額,貸方金額,税区分,摘要";
  const rows = journal.entries.map(
    (line) =>
      `${journal.date},${line.accountCode},${line.accountName},${line.debit},${line.credit},${line.taxCategory},${journal.description}`,
  );
  return [header, ...rows].join("\n");
};

/**
 * すべての決定論的バリデーションを一括実行する
 */
const runAllValidations = (invoice: ParsedInvoice, journal: JournalEntry): ValidationResult => {
  const results = [
    validateTaxCalculation(invoice),
    validateDebitCreditBalance(journal),
    validateAccountCodes(journal),
  ];

  const allErrors = results.flatMap((r) => r.errors);
  return {
    errors: allErrors,
    valid: allErrors.filter((e) => e.severity === "error").length === 0,
  };
};

export {
  ACCOUNT_MASTER,
  VENDOR_DEFAULT_ACCOUNTS,
  journalToCSV,
  runAllValidations,
  validateAccountCodes,
  validateDebitCreditBalance,
  validateTaxCalculation,
};
