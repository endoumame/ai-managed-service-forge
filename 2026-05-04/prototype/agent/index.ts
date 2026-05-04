import type {
  ExtractedData,
  ExtractedItem,
  InvoiceInput,
  InvoiceItem,
  JournalCandidate,
  JournalEntry,
  KnowledgeStore,
} from "../types.ts";
import { buildJournalEntries } from "../deterministic/rules.ts";
import { findMatchingRule } from "../knowledge/store.ts";
import { logger } from "../logger.ts";

const EMPTY = 0;
const FIRST_INDEX = 0;
const CONFIDENCE_HIGH = 0.95;
const CONFIDENCE_MEDIUM = 0.75;
const CONFIDENCE_LOW = 0.5;
const ANOMALY_RATIO = 3;
const DEFAULT_CREDIT_ACCOUNT = "買掛金";

const VENDOR_ALIAS_PATTERNS: [RegExp, string][] = [
  [/(?:株式会社|㈱|\(株\))\s*/g, ""],
  [/(?:有限会社|㈲|\(有\))\s*/g, ""],
  [/\s+/g, ""],
];

const normalizeVendorName = (name: string): string => {
  let normalized = name;
  for (const [pattern, replacement] of VENDOR_ALIAS_PATTERNS) {
    normalized = normalized.replace(pattern, replacement);
  }
  return normalized;
};

const CATEGORY_KEYWORDS: [string, string][] = [
  ["サーバ", "通信費"],
  ["クラウド", "通信費"],
  ["AWS", "通信費"],
  ["GCP", "通信費"],
  ["Azure", "通信費"],
  ["コンサル", "支払手数料"],
  ["顧問", "支払手数料"],
  ["広告", "広告宣伝費"],
  ["文房具", "消耗品費"],
  ["備品", "消耗品費"],
  ["交通", "旅費交通費"],
  ["タクシー", "旅費交通費"],
  ["家賃", "地代家賃"],
  ["賃料", "地代家賃"],
];

const DEFAULT_CATEGORY = "雑費";

const suggestCategory = (
  description: string,
  knowledge: KnowledgeStore,
  vendorName: string,
): string => {
  const rule = findMatchingRule(knowledge, vendorName, description);
  if (rule !== null) {
    return rule.accountName;
  }

  for (const [keyword, category] of CATEGORY_KEYWORDS) {
    if (description.includes(keyword)) {
      return category;
    }
  }
  return DEFAULT_CATEGORY;
};

const extractItem = (
  item: InvoiceItem,
  knowledge: KnowledgeStore,
  vendorName: string,
): ExtractedItem => ({
  amount: item.amount,
  description: item.description,
  quantity: item.quantity,
  suggestedCategory: suggestCategory(item.description, knowledge, vendorName),
  taxRate: item.taxRate,
  unitPrice: item.unitPrice,
});

const extractInvoiceData = (invoice: InvoiceInput, knowledge: KnowledgeStore): ExtractedData => {
  const normalizedVendor = normalizeVendorName(invoice.vendorName);
  logger.info(`データ抽出: ${invoice.vendorName} → ${normalizedVendor}`);

  const items = invoice.items.map((item) => extractItem(item, knowledge, normalizedVendor));
  const qualifiedNumber = invoice.invoiceNumber.startsWith("T") ? invoice.invoiceNumber : null;

  return {
    dueDate: invoice.dueDate,
    invoiceNumber: invoice.invoiceNumber,
    issueDate: invoice.issueDate,
    items,
    normalizedVendorName: normalizedVendor,
    qualifiedInvoiceNumber: qualifiedNumber,
    taxAmount: invoice.taxAmount,
    totalAmount: invoice.totalAmount,
    vendorName: invoice.vendorName,
  };
};

interface ConfidenceFactors {
  hasKnowledgeRule: boolean;
  hasQualifiedNumber: boolean;
  amountIsNormal: boolean;
}

const calculateConfidence = (factors: ConfidenceFactors): number => {
  if (factors.hasKnowledgeRule && factors.hasQualifiedNumber && factors.amountIsNormal) {
    return CONFIDENCE_HIGH;
  }
  if (factors.hasKnowledgeRule || factors.hasQualifiedNumber) {
    return CONFIDENCE_MEDIUM;
  }
  return CONFIDENCE_LOW;
};

const determineReviewReasons = (factors: ConfidenceFactors): string[] => {
  const reasons: string[] = [];
  if (!factors.hasKnowledgeRule) {
    reasons.push("過去の仕訳パターンなし（新規取引先または品目）");
  }
  if (!factors.hasQualifiedNumber) {
    reasons.push("適格請求書番号が未検出");
  }
  if (!factors.amountIsNormal) {
    reasons.push("金額が過去パターンから大幅に乖離");
  }
  return reasons;
};

const checkAmountNormality = (extracted: ExtractedData, knowledge: KnowledgeStore): boolean => {
  const vendorKey = extracted.normalizedVendorName;
  if (!(vendorKey in knowledge.averageAmounts)) {
    return true;
  }
  const stats = knowledge.averageAmounts[vendorKey];
  if (stats === null) {
    return true;
  }
  const deviation = Math.abs(extracted.totalAmount - stats.mean);
  return deviation <= stats.stddev * ANOMALY_RATIO;
};

const buildReviewReasons = (
  extracted: ExtractedData,
  knowledge: KnowledgeStore,
): ConfidenceFactors => {
  const hasFirstItem = extracted.items.length > EMPTY;
  const hasKnowledgeRule =
    hasFirstItem &&
    findMatchingRule(
      knowledge,
      extracted.normalizedVendorName,
      extracted.items[FIRST_INDEX].description,
    ) !== null;

  return {
    amountIsNormal: checkAmountNormality(extracted, knowledge),
    hasKnowledgeRule,
    hasQualifiedNumber: extracted.qualifiedInvoiceNumber !== null,
  };
};

const generateJournalCandidate = (
  invoiceId: string,
  extracted: ExtractedData,
  knowledge: KnowledgeStore,
): JournalCandidate => {
  const entries: JournalEntry[] = buildJournalEntries(extracted, DEFAULT_CREDIT_ACCOUNT);
  const factors = buildReviewReasons(extracted, knowledge);
  const confidenceScore = calculateConfidence(factors);
  const reviewReasons = determineReviewReasons(factors);

  logger.info(`仕訳候補生成: 信頼度 ${confidenceScore}, レビュー理由 ${reviewReasons.length} 件`);

  return {
    confidenceScore,
    entries,
    invoiceId,
    needsHumanReview: reviewReasons.length > EMPTY,
    reasoning: `取引先: ${extracted.normalizedVendorName}, 明細数: ${extracted.items.length}`,
    reviewReasons,
  };
};

export { extractInvoiceData, generateJournalCandidate, normalizeVendorName };
