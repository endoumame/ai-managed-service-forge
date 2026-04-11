/**
 * 決定論的コード層: 仕訳ルールエンジン
 *
 * なぜAIではなく決定論的コードで仕訳ルールを適用するか:
 * 「取引先A × 品目カテゴリB → 勘定科目C」というマッピングは
 * 一度確定すれば変わらないルールベースの処理。
 * AIに毎回推論させるとコスト・レイテンシ・一貫性の全てで劣る。
 * ルールテーブルに無いパターンのみAIに推論を委譲する。
 */

import type {
  ExtractedInvoice,
  ExtractedLineItem,
  JournalEntry,
  JournalLine,
  JournalRule,
} from "../types.ts";

const CONFIDENCE_THRESHOLD = 0.8;
const TAX_RATE_10 = 0.1;
const ZERO = 0;
const INDEX_OFFSET = 1;

const DEFAULT_RULES: JournalRule[] = [
  {
    category: "事務用品",
    creditAccountCode: "2100",
    creditAccountName: "買掛金",
    debitAccountCode: "6100",
    debitAccountName: "消耗品費",
    id: "rule-001",
    source: "initial",
    taxCategory: "課税仕入10%",
    usageCount: 15,
    vendorId: "vendor-acme",
  },
  {
    category: "ソフトウェア",
    creditAccountCode: "2100",
    creditAccountName: "買掛金",
    debitAccountCode: "6200",
    debitAccountName: "ソフトウェア費",
    id: "rule-002",
    source: "initial",
    taxCategory: "課税仕入10%",
    usageCount: 8,
    vendorId: "vendor-acme",
  },
  {
    category: "コンサルティング",
    creditAccountCode: "2100",
    creditAccountName: "買掛金",
    debitAccountCode: "6300",
    debitAccountName: "外注費",
    id: "rule-003",
    source: "initial",
    taxCategory: "課税仕入10%",
    usageCount: 5,
    vendorId: "*",
  },
  {
    category: "*",
    creditAccountCode: "2100",
    creditAccountName: "買掛金",
    debitAccountCode: "6999",
    debitAccountName: "未分類費用",
    id: "rule-fallback",
    source: "initial",
    taxCategory: "課税仕入10%",
    usageCount: 0,
    vendorId: "*",
  },
];

/**
 * ルールテーブルから最も具体的なルールを検索する
 * 優先順位: 取引先ID+品目 > 全取引先+品目 > 全取引先+全品目(fallback)
 */
const findRule = (vendorId: string | null, category: string, rules: JournalRule[]): JournalRule => {
  const exactMatch = rules.find((rule) => rule.vendorId === vendorId && rule.category === category);
  if (exactMatch) {
    return exactMatch;
  }

  const categoryMatch = rules.find((rule) => rule.vendorId === "*" && rule.category === category);
  if (categoryMatch) {
    return categoryMatch;
  }

  const fallback = rules.find((rule) => rule.vendorId === "*" && rule.category === "*");
  return fallback ?? DEFAULT_RULES[DEFAULT_RULES.length - INDEX_OFFSET];
};

const lineItemToJournalLines = (
  item: ExtractedLineItem,
  rule: JournalRule,
  vendorName: string,
): JournalLine[] => {
  const taxAmount = Math.round(item.amount * TAX_RATE_10);
  const totalWithTax = item.amount + taxAmount;
  const memo = `${vendorName} - ${item.description}`;
  return [
    {
      accountCode: rule.debitAccountCode,
      accountName: rule.debitAccountName,
      credit: ZERO,
      debit: totalWithTax,
      description: memo,
      taxCategory: rule.taxCategory,
    },
    {
      accountCode: rule.creditAccountCode,
      accountName: rule.creditAccountName,
      credit: totalWithTax,
      debit: ZERO,
      description: memo,
      taxCategory: rule.taxCategory,
    },
  ];
};

const collectWarnings = (extracted: ExtractedInvoice, ruleWarnings: string[]): string[] => {
  const warnings = [...ruleWarnings];
  if (extracted.vendorId === null) {
    warnings.push("新規取引先のため人間確認が必要です");
  }
  if (extracted.confidence < CONFIDENCE_THRESHOLD) {
    warnings.push(`AI信頼度が閾値未満です: ${extracted.confidence}`);
  }
  return warnings;
};

/**
 * 抽出済み請求書から仕訳データを生成する
 */
const classifyInvoice = (extracted: ExtractedInvoice, rules: JournalRule[]): JournalEntry => {
  const ruleWarnings: string[] = [];
  const journalLines: JournalLine[] = [];

  for (const item of extracted.lineItems) {
    const rule = findRule(extracted.vendorId, item.category, rules);
    if (rule.category === "*") {
      ruleWarnings.push(`品目"${item.description}"(${item.category})に該当するルールがありません`);
    }
    journalLines.push(...lineItemToJournalLines(item, rule, extracted.vendorName));
  }

  const warnings = collectWarnings(extracted, ruleWarnings);
  const needsHumanReview = warnings.length > ZERO || extracted.vendorId === null;

  return {
    date: extracted.invoiceDate,
    entries: journalLines,
    invoiceId: extracted.invoiceId,
    status: needsHumanReview ? "flagged" : "validated",
    vendorId: extracted.vendorId ?? "unknown",
    vendorName: extracted.vendorName,
    warnings,
  };
};

const getDefaultRules = (): JournalRule[] => structuredClone(DEFAULT_RULES);

export { classifyInvoice, findRule, getDefaultRules };
