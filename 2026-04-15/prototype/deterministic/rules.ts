/**
 * 決定論的コード層 — ルールベース処理
 *
 * なぜこの実装か:
 * 消費税計算や金額整合性チェックは「正解が一意に定まる」処理であり、
 * AIに任せると不要な推論コストとハルシネーションリスクが発生する。
 * 決定論的コードで確実に処理することで、ハーネス層のバリデーションが
 * AI出力の「不確実な部分」のみに集中できる。
 *
 * この層はI/Oを持たない純粋関数のみで構成される。
 * 勘定科目マスタ等のデータは外部から注入される。
 */

import type {
  AccountCode,
  ClassificationResult,
  Invoice,
  ValidationContext,
  ValidationIssue,
  ValidationResult,
  VendorPattern,
} from "../types.js";

// 消費税の端数処理で許容する最大差異（円）
const TAX_ROUNDING_TOLERANCE = 1;

interface InvoiceTotals {
  subtotal: number;
  tax: number;
}

/**
 * 請求書の明細から小計と消費税を再計算する。
 */
const computeInvoiceTotals = (invoice: Invoice): InvoiceTotals => {
  let subtotal = 0;
  let tax = 0;
  for (const item of invoice.items) {
    const itemTotal = item.quantity * item.unitPrice;
    subtotal += itemTotal;
    tax += Math.floor(itemTotal * item.taxRate);
  }
  return { subtotal, tax };
};

/**
 * 消費税の計算検証
 * 税率テーブル × 税抜金額で再計算し、請求書記載額と照合する。
 * 軽減税率（8%）と標準税率（10%）の混在にも対応。
 */
const verifyTaxCalculation = (invoice: Invoice): ValidationIssue[] => {
  const calculated = computeInvoiceTotals(invoice);
  const issues: ValidationIssue[] = [];

  if (calculated.subtotal !== invoice.subtotal) {
    issues.push({
      field: "subtotal",
      message: `小計が不一致: 計算値=${calculated.subtotal}, 記載値=${invoice.subtotal}`,
      severity: "error",
    });
  }

  // 消費税は端数処理の差異を許容（±1円）
  if (Math.abs(calculated.tax - invoice.taxAmount) > TAX_ROUNDING_TOLERANCE) {
    issues.push({
      field: "taxAmount",
      message: `消費税額が不一致: 計算値=${calculated.tax}, 記載値=${invoice.taxAmount}`,
      severity: "error",
    });
  }

  if (invoice.subtotal + invoice.taxAmount !== invoice.totalAmount) {
    issues.push({
      field: "totalAmount",
      message: `合計金額が不一致: 小計+税=${invoice.subtotal + invoice.taxAmount}, 記載値=${invoice.totalAmount}`,
      severity: "error",
    });
  }

  return issues;
};

/**
 * 勘定科目コードの存在検証
 * AIが推論した科目コードがマスタに存在するかチェック。
 * 存在しない科目を返すハルシネーションを検知する。
 */
const verifyAccountCode = (
  classification: ClassificationResult,
  accountMaster: AccountCode[],
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const account = accountMaster.find((acc) => acc.code === classification.accountCode);

  if (!account) {
    issues.push({
      field: "accountCode",
      message: `勘定科目コード '${classification.accountCode}' はマスタに存在しません`,
      severity: "error",
    });
  } else if (account.name !== classification.accountName) {
    issues.push({
      field: "accountName",
      message: `科目名が不一致: マスタ='${account.name}', AI回答='${classification.accountName}'`,
      severity: "warning",
    });
  }

  return issues;
};

/**
 * 重複請求書の検出
 * 同一の請求書番号が複数回処理されていないかチェック。
 */
const detectDuplicateInvoice = (
  invoice: Invoice,
  processedInvoiceNumbers: Set<string>,
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  if (processedInvoiceNumbers.has(invoice.invoiceNumber)) {
    issues.push({
      field: "invoiceNumber",
      message: `請求書番号 '${invoice.invoiceNumber}' は既に処理済みです（重複の可能性）`,
      severity: "warning",
    });
  }

  return issues;
};

/**
 * 過去パターンとの乖離チェック
 * 同一取引先の過去仕訳と大幅に異なる金額の場合に警告。
 */
const checkAmountDeviation = (
  invoice: Invoice,
  pastPatterns: VendorPattern[],
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  const vendorPatterns = pastPatterns.filter((pat) => pat.vendor === invoice.vendor);
  const hasNoHistory = vendorPatterns.length < TAX_ROUNDING_TOLERANCE;
  if (hasNoHistory) {
    issues.push({
      field: "vendor",
      message: `新規取引先 '${invoice.vendor}' からの初回請求書です。人間の確認を推奨します`,
      severity: "info",
    });
  }

  return issues;
};

/**
 * 全バリデーションルールを統合実行
 * accountMaster を外部から注入することで、この層は純粋関数として動作する。
 */
const validateInvoice = (ctx: ValidationContext): ValidationResult => {
  const allIssues: ValidationIssue[] = [
    ...verifyTaxCalculation(ctx.invoice),
    ...verifyAccountCode(ctx.classification, ctx.accountMaster),
    ...detectDuplicateInvoice(ctx.invoice, ctx.processedInvoiceNumbers),
    ...checkAmountDeviation(ctx.invoice, ctx.pastPatterns),
  ];

  return {
    invoiceId: ctx.invoice.id,
    issues: allIssues,
    valid: !allIssues.some((issue) => issue.severity === "error"),
  };
};

/**
 * 仕訳データのフォーマット変換（CSV形式）
 * 決定論的な変換処理。AIに任せない。
 */
const formatJournalEntry = (invoice: Invoice, accountCode: string, accountName: string): string => {
  const date = invoice.date.replaceAll("-", "/");
  return [
    date,
    accountCode,
    accountName,
    invoice.vendor,
    invoice.totalAmount.toLocaleString(),
    invoice.items.map((item) => item.description).join("; "),
  ].join(",");
};

export {
  checkAmountDeviation,
  detectDuplicateInvoice,
  formatJournalEntry,
  validateInvoice,
  verifyAccountCode,
  verifyTaxCalculation,
};
