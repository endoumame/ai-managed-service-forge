import type {
  Anomaly,
  ExtractedLineItem,
  ExtractionResult,
  Invoice,
  InvoiceLineItem,
} from "../types.ts";
import { findVendor, getCorrections } from "../knowledge/store.ts";

const HIGH_CONFIDENCE = 0.95;
const MEDIUM_CONFIDENCE = 0.7;
const LOW_CONFIDENCE = 0.5;
const DEFAULT_EXPENSE_CODE = "6000";
const DEFAULT_EXPENSE_NAME = "雑費";
const ZERO = 0;
const ONE = 1;

const inferAccountFromVendor = (
  vendorName: string,
): { code: string; name: string; confidence: number } => {
  const vendor = findVendor(vendorName);
  if (vendor !== null) {
    return {
      code: vendor.defaultAccountCode,
      confidence: HIGH_CONFIDENCE,
      name: vendor.defaultAccountName,
    };
  }
  return { code: DEFAULT_EXPENSE_CODE, confidence: LOW_CONFIDENCE, name: DEFAULT_EXPENSE_NAME };
};

const lastElement = <TItem>(arr: TItem[]): TItem => arr[arr.length - ONE];

const inferAccountFromHistory = (
  vendorName: string,
): { code: string; name: string; confidence: number } | null => {
  const corrections = getCorrections();
  const vendorCorrections = corrections.filter((corr) => corr.vendorName === vendorName);

  if (vendorCorrections.length === ZERO) {
    return null;
  }

  const latest = lastElement(vendorCorrections);
  return {
    code: latest.correctedAccountCode,
    confidence: MEDIUM_CONFIDENCE,
    name: latest.correctedAccountName,
  };
};

const classifyLineItem = (line: InvoiceLineItem, vendorName: string): ExtractedLineItem => {
  const historyBased = inferAccountFromHistory(vendorName);
  const vendorBased = inferAccountFromVendor(vendorName);
  const best = historyBased ?? vendorBased;

  return {
    ...line,
    confidence: best.confidence,
    suggestedAccountCode: best.code,
    suggestedAccountName: best.name,
  };
};

const detectAnomalies = (invoice: Invoice): Anomaly[] => {
  const anomalies: Anomaly[] = [];
  const vendor = findVendor(invoice.vendorName);

  if (vendor === null) {
    anomalies.push({
      message: `新規取引先: ${invoice.vendorName}（過去の取引履歴なし）`,
      severity: "warning",
      type: "new_vendor",
    });
  }

  if (invoice.lineItems.length === ZERO) {
    anomalies.push({
      message: "明細行が空です",
      severity: "critical",
      type: "missing_field",
    });
  }

  return anomalies;
};

const extractAndClassify = (invoice: Invoice): ExtractionResult => {
  const anomalies = detectAnomalies(invoice);
  const extractedLines = invoice.lineItems.map((line) =>
    classifyLineItem(line, invoice.vendorName),
  );

  return { anomalies, extractedLines, invoice };
};

export { classifyLineItem, detectAnomalies, extractAndClassify };
