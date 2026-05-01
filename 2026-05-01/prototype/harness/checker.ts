import type { ExtractedInvoiceData, Invoice } from "../types.ts";

// 品質チェッカー: 決定論的に検証可能な項目を網羅的にチェックする
// AIの出力に対する「外部の目」として機能する

interface QualityReport {
  passed: boolean;
  checks: QualityCheck[];
}

interface QualityCheck {
  name: string;
  passed: boolean;
  message: string;
}

// oxlint-disable-next-line eslint(no-magic-numbers) -- 日本の標準消費税率
const STANDARD_TAX_RATE = 0.1;
// oxlint-disable-next-line eslint(no-magic-numbers) -- 端数処理による1円以内の誤差を許容
const ROUNDING_TOLERANCE = 1;

const checkTaxConsistency = (data: ExtractedInvoiceData): QualityCheck => {
  const expectedTax = Math.floor(data.subtotal * STANDARD_TAX_RATE);
  const diff = Math.abs(data.taxAmount - expectedTax);
  const passed = diff <= ROUNDING_TOLERANCE;
  return {
    message: passed
      ? `税額 ${data.taxAmount}円 (税率10%で妥当)`
      : `税額不整合: 期待値=${expectedTax}円, 実際=${data.taxAmount}円 (差額${diff}円)`,
    name: "税率整合性",
    passed,
  };
};

const checkTotalConsistency = (data: ExtractedInvoiceData): QualityCheck => {
  const expectedTotal = data.subtotal + data.taxAmount;
  const passed = Math.abs(data.totalAmount - expectedTotal) <= ROUNDING_TOLERANCE;
  return {
    message: passed
      ? `合計 ${data.totalAmount}円 = 小計 ${data.subtotal}円 + 税 ${data.taxAmount}円`
      : `合計不整合: ${data.subtotal} + ${data.taxAmount} ≠ ${data.totalAmount}`,
    name: "合計金額整合性",
    passed,
  };
};

const checkItemAmounts = (data: ExtractedInvoiceData): QualityCheck => {
  const errors: string[] = [];
  for (const item of data.items) {
    const expected = item.quantity * item.unitPrice;
    if (Math.abs(item.amount - expected) > ROUNDING_TOLERANCE) {
      errors.push(`「${item.description}」: ${item.quantity} × ${item.unitPrice} ≠ ${item.amount}`);
    }
  }
  const passed = errors.length < ROUNDING_TOLERANCE;
  return {
    message: passed ? "全品目の金額計算が正しい" : errors.join("; "),
    name: "品目金額計算",
    passed,
  };
};

const checkAmountThreshold = (data: ExtractedInvoiceData): QualityCheck => {
  const HIGH_THRESHOLD = 1_000_000;
  const isHigh = data.totalAmount >= HIGH_THRESHOLD;
  return {
    message: isHigh
      ? `⚠ 高額請求書: ${data.totalAmount.toLocaleString()}円 (${HIGH_THRESHOLD.toLocaleString()}円以上)`
      : `通常範囲: ${data.totalAmount.toLocaleString()}円`,
    name: "金額閾値チェック",
    passed: true,
  };
};

const runQualityChecks = (invoice: Invoice): QualityReport => {
  if (!invoice.extractedData) {
    return {
      checks: [{ message: "抽出データがありません", name: "データ存在", passed: false }],
      passed: false,
    };
  }

  const data = invoice.extractedData;
  const checks = [
    checkTaxConsistency(data),
    checkTotalConsistency(data),
    checkItemAmounts(data),
    checkAmountThreshold(data),
  ];

  return {
    checks,
    passed: checks.every((ch) => ch.passed),
  };
};

export { runQualityChecks };
export type { QualityReport };
