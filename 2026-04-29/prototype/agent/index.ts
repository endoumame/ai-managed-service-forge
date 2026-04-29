import type { ExtractedData, JournalEntry, RawInvoice } from "../types.ts";
import { resolveAccountCode } from "../deterministic/rules.ts";

const HIGH_CONFIDENCE = 0.95;
const MEDIUM_CONFIDENCE = 0.75;
const TAX_RATE_STANDARD = 0.1;
const SUM_INITIAL = 0;
const ANOMALY_RATIO = 2;
const UNCLASSIFIED_CODE = "9999";
const PAYABLE_CODE = "2100";

const normalizeVendorName = (vendor: string): string =>
  vendor
    .replaceAll(/[（(]/g, "(")
    .replaceAll(/[）)]/g, ")")
    .replaceAll("(株)", "株式会社")
    .replaceAll(/\s+/g, "");

const extractInvoiceData = (invoice: RawInvoice): ExtractedData => {
  const items = invoice.items.map((item) => ({
    description: item.description,
    lineTotal: item.quantity * item.unitPrice,
    quantity: item.quantity,
    taxAmount: Math.floor(item.quantity * item.unitPrice * item.taxRate),
    taxRate: item.taxRate,
    unitPrice: item.unitPrice,
  }));

  return {
    confidence: HIGH_CONFIDENCE,
    date: invoice.date,
    invoiceId: invoice.id,
    items,
    subtotal: invoice.subtotal,
    taxAmount: invoice.taxAmount,
    total: invoice.total,
    vendorName: invoice.vendor,
    vendorNameNormalized: normalizeVendorName(invoice.vendor),
  };
};

interface JournalBuildContext {
  extracted: ExtractedData;
  knownVendorPatterns: Map<string, string>;
}

const buildDebitEntries = (ctx: JournalBuildContext): JournalEntry["entries"] =>
  ctx.extracted.items.map((item) => {
    const known = ctx.knownVendorPatterns.get(item.description);
    const account =
      typeof known === "string" && known.length > SUM_INITIAL
        ? { code: known, name: "" }
        : resolveAccountCode(item.description);
    return {
      accountCode: account?.code ?? UNCLASSIFIED_CODE,
      accountName: account?.name ?? "未分類",
      amount: item.lineTotal + item.taxAmount,
      description: item.description,
      side: "debit" as const,
    };
  });

const buildJournalEntry = (ctx: JournalBuildContext): JournalEntry => {
  const debitEntries = buildDebitEntries(ctx);
  const creditTotal = debitEntries.reduce((sum, en) => sum + en.amount, SUM_INITIAL);
  const hasUnclassified = debitEntries.some((en) => en.accountCode === UNCLASSIFIED_CODE);

  return {
    confidence: hasUnclassified ? MEDIUM_CONFIDENCE : HIGH_CONFIDENCE,
    date: ctx.extracted.date,
    entries: [
      ...debitEntries,
      {
        accountCode: PAYABLE_CODE,
        accountName: "買掛金",
        amount: creditTotal,
        description: `${ctx.extracted.vendorName} への支払い`,
        side: "credit" as const,
      },
    ],
    invoiceId: ctx.extracted.invoiceId,
    reasoning: hasUnclassified
      ? "一部の品目で勘定科目を特定できませんでした。人間の確認を推奨します。"
      : "過去のパターンおよびキーワードマッチにより科目を自動判定しました。",
  };
};

const detectAnomalies = (extracted: ExtractedData, historicalAmounts: number[]): string[] => {
  const anomalies: string[] = [];
  if (historicalAmounts.length === SUM_INITIAL) {
    anomalies.push(`新規取引先: ${extracted.vendorName}`);
    return anomalies;
  }
  const avg =
    historicalAmounts.reduce((sum, val) => sum + val, SUM_INITIAL) / historicalAmounts.length;
  if (extracted.total > avg * ANOMALY_RATIO) {
    anomalies.push(
      `金額異常: ${extracted.total}円（過去平均 ${Math.round(avg)}円 の ${ANOMALY_RATIO}倍超）`,
    );
  }
  return anomalies;
};

export {
  HIGH_CONFIDENCE,
  MEDIUM_CONFIDENCE,
  TAX_RATE_STANDARD,
  normalizeVendorName,
  extractInvoiceData,
  buildJournalEntry,
  detectAnomalies,
};
