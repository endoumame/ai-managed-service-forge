// 決定論的コード層: ルールベース処理
// AIに任せず確定的に計算すべきビジネスロジックを集約する

import type { ExtractedInvoice, JournalEntry, MatchResult, PurchaseOrder } from "../types.ts";
import { log } from "../logger.ts";

const STANDARD_TAX_RATE = 0.1;
const REDUCED_TAX_RATE = 0.08;
const ACCOUNTS_PAYABLE_CODE = "2100";
const ACCOUNTS_PAYABLE_NAME = "買掛金";
const TAX_RECEIVABLE_CODE = "1500";
const TAX_RECEIVABLE_NAME = "仮払消費税";
const HIGH_MATCH_CONFIDENCE = 0.95;
const MEDIUM_MATCH_CONFIDENCE = 0.7;
const LOW_MATCH_CONFIDENCE = 0.4;
const REVIEW_THRESHOLD = 0.7;

const normalizeVendorName = (name: string): string =>
  name
    .replaceAll(/[\s　]+/g, "")
    .replaceAll(/[（(]/g, "(")
    .replaceAll(/[）)]/g, ")")
    .replaceAll("㈱", "(株)")
    .replaceAll("株式会社", "(株)");

const matchVendor = (invoiceVendor: string, purchaseOrder: PurchaseOrder): number => {
  const normalized = normalizeVendorName(invoiceVendor);
  const poNormalized = normalizeVendorName(purchaseOrder.vendor);

  if (normalized === poNormalized) {
    return HIGH_MATCH_CONFIDENCE;
  }

  const aliasMatch = purchaseOrder.vendorAliases.some(
    (alias) => normalizeVendorName(alias) === normalized,
  );
  if (aliasMatch) {
    return HIGH_MATCH_CONFIDENCE;
  }

  const includesMatch = normalized.includes(poNormalized) || poNormalized.includes(normalized);
  return includesMatch ? MEDIUM_MATCH_CONFIDENCE : LOW_MATCH_CONFIDENCE;
};

interface BestMatchResult {
  match: PurchaseOrder | null;
  score: number;
}

const findBestMatch = (vendor: string, purchaseOrders: PurchaseOrder[]): BestMatchResult => {
  let match: PurchaseOrder | null = null;
  let score = LOW_MATCH_CONFIDENCE;

  for (const po of purchaseOrders) {
    const current = matchVendor(vendor, po);
    if (current > score) {
      score = current;
      match = po;
    }
  }
  return { match, score };
};

const buildMatchResult = (
  invoiceId: string,
  subtotal: number,
  best: BestMatchResult,
): MatchResult => {
  const amountDiff =
    best.match === null
      ? STANDARD_TAX_RATE
      : (subtotal - best.match.totalAmount) / best.match.totalAmount;
  const needsReview = best.score < REVIEW_THRESHOLD || best.match === null;

  return {
    amountDifference: amountDiff,
    invoiceId,
    matchConfidence: best.score,
    matchReason:
      best.match === null
        ? "照合可能な発注書が見つかりません"
        : `取引先名の一致: ${best.match.vendor}`,
    matchedPoId: best.match?.poId ?? null,
    needsHumanReview: needsReview,
    reviewReason: needsReview ? `信頼度${best.score}が閾値${REVIEW_THRESHOLD}未満` : "",
  };
};

const matchInvoiceToPO = (
  invoice: ExtractedInvoice,
  purchaseOrders: PurchaseOrder[],
): MatchResult => {
  const best = findBestMatch(invoice.vendor, purchaseOrders);
  log(`  [Match] ${invoice.invoiceId}: スコア=${best.score}, PO=${best.match?.poId ?? "なし"}`);
  return buildMatchResult(invoice.invoiceId, invoice.subtotal, best);
};

const calculateTax = (subtotal: number, taxRate: number): number => Math.round(subtotal * taxRate);

const generateJournalEntry = (
  invoice: ExtractedInvoice,
  matchResult: MatchResult,
  purchaseOrders: PurchaseOrder[],
): JournalEntry => {
  const matchedPO = purchaseOrders.find((po) => po.poId === matchResult.matchedPoId);

  const accountCode = matchedPO?.accountCode ?? "6900";
  const accountName = matchedPO?.accountName ?? "雑費";
  const taxRate = matchedPO?.taxRate ?? STANDARD_TAX_RATE;
  const taxAmount = calculateTax(invoice.subtotal, taxRate);
  const confidence = matchResult.matchConfidence;
  const entryStatus = confidence >= REVIEW_THRESHOLD ? "auto-approved" : "pending-review";

  return {
    confidence,
    credit: {
      accountCode: ACCOUNTS_PAYABLE_CODE,
      accountName: ACCOUNTS_PAYABLE_NAME,
      amount: invoice.subtotal + taxAmount,
    },
    date: invoice.invoiceDate,
    debit: { accountCode, accountName, amount: invoice.subtotal },
    description: `${invoice.vendor} - ${invoice.items.map((item) => item.description).join(", ")}`,
    entryId: `JE-${invoice.invoiceId}`,
    invoiceId: invoice.invoiceId,
    status: entryStatus,
    taxEntry: {
      credit: {
        accountCode: ACCOUNTS_PAYABLE_CODE,
        accountName: ACCOUNTS_PAYABLE_NAME,
        amount: taxAmount,
      },
      debit: {
        accountCode: TAX_RECEIVABLE_CODE,
        accountName: TAX_RECEIVABLE_NAME,
        amount: taxAmount,
      },
    },
  };
};

export {
  calculateTax,
  generateJournalEntry,
  matchInvoiceToPO,
  normalizeVendorName,
  REDUCED_TAX_RATE,
  STANDARD_TAX_RATE,
};
