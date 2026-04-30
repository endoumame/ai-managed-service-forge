import type { ExtractedTransaction, JournalEntry, JournalLine, TaxCategory } from "../types.js";
import {
  calculateTax,
  determineTaxCategory,
  findAccount,
  generateJournalId,
  getAccountMaster,
} from "../deterministic/rules.js";
import type { KnowledgeStore } from "../knowledge/store.js";
import { findMatchingPattern } from "../knowledge/store.js";

const HIGH_CONFIDENCE = 0.95;
const MEDIUM_CONFIDENCE = 0.7;
const LOW_CONFIDENCE = 0.5;
const ZERO = 0;
const REGEX_CAPTURE_GROUP = 1;
const ISO_DATE_START = 0;
const ISO_DATE_END = 10;
const DEFAULT_TAX_RATE = 0.1;

interface AgentConfig {
  useMock: boolean;
  apiKey?: string;
}

interface ClassificationResult {
  accountCode: string;
  accountName: string;
  taxCategory: TaxCategory;
  confidence: number;
  reasoning: string;
}

interface ProcessTransactionParams {
  rawText: string;
  transactionId: string;
  store: KnowledgeStore;
}

const extractTransaction = (rawText: string, transactionId: string): ExtractedTransaction => {
  const dateMatch = rawText.match(/(\d{4}[-/]\d{1,2}[-/]\d{1,2})/);
  const amountMatch = rawText.match(/(\d[\d,]+)\s*円/);
  const firstLine = rawText.split(/\n/).find((ln) => ln.trim() !== "");

  return {
    amount: amountMatch ? Number(amountMatch[REGEX_CAPTURE_GROUP].replaceAll(",", "")) : ZERO,
    counterparty: firstLine?.trim() ?? "",
    date: dateMatch
      ? dateMatch[REGEX_CAPTURE_GROUP].replaceAll("/", "-")
      : new Date().toISOString().slice(ISO_DATE_START, ISO_DATE_END),
    description: rawText,
    id: transactionId,
    rawText,
    taxRate: DEFAULT_TAX_RATE,
  };
};

const classifyWithKnowledge = (
  store: KnowledgeStore,
  extracted: ExtractedTransaction,
): ClassificationResult | null => {
  const match = findMatchingPattern(store, extracted.counterparty, extracted.description);
  if (!match) {
    return null;
  }
  return {
    accountCode: match.accountCode,
    accountName: match.accountName,
    confidence: HIGH_CONFIDENCE,
    reasoning: `ナレッジパターン「${match.id}」に一致（使用回数: ${String(match.usageCount)}）`,
    taxCategory: match.taxCategory,
  };
};

const classifyWithMock = (extracted: ExtractedTransaction): ClassificationResult => {
  const desc = extracted.description.toLowerCase();
  const accounts = getAccountMaster();

  const keywordMap: { keywords: string[]; code: string }[] = [
    { code: "6100", keywords: ["交通", "電車", "タクシー", "新幹線", "飛行機"] },
    { code: "6200", keywords: ["通信", "電話", "インターネット", "携帯"] },
    { code: "6300", keywords: ["文房具", "コピー用紙", "消耗品", "事務用品"] },
    { code: "6400", keywords: ["接待", "会食", "ゴルフ", "贈答"] },
    { code: "6500", keywords: ["会議", "ミーティング", "弁当", "飲料"] },
    { code: "6900", keywords: ["家賃", "賃料", "オフィス"] },
    { code: "7000", keywords: ["電気", "ガス", "水道", "光熱"] },
    { code: "6700", keywords: ["広告", "宣伝", "マーケティング", "pr"] },
    { code: "6800", keywords: ["手数料", "振込", "送金"] },
    { code: "5100", keywords: ["仕入", "材料", "原材料", "商品"] },
  ];

  for (const mapping of keywordMap) {
    if (mapping.keywords.some((kw) => desc.includes(kw))) {
      const acct = accounts.find((ac) => ac.code === mapping.code);
      if (acct) {
        return {
          accountCode: acct.code,
          accountName: acct.name,
          confidence: MEDIUM_CONFIDENCE,
          reasoning: `キーワードマッチ: 「${mapping.keywords.find((kw) => desc.includes(kw)) ?? ""}」に基づく推定`,
          taxCategory: determineTaxCategory(acct.code),
        };
      }
    }
  }

  return {
    accountCode: "7500",
    accountName: "雑費",
    confidence: LOW_CONFIDENCE,
    reasoning: "該当するキーワードが見つからないため、雑費として分類",
    taxCategory: "taxable_10",
  };
};

const buildJournalEntry = (
  extracted: ExtractedTransaction,
  classification: ClassificationResult,
): JournalEntry => {
  const taxInfo = calculateTax(extracted.amount, classification.taxCategory);
  const lines: JournalLine[] = [
    {
      accountCode: classification.accountCode,
      accountName: classification.accountName,
      credit: ZERO,
      debit: taxInfo.taxExcluded,
      taxCategory: classification.taxCategory,
    },
  ];

  if (taxInfo.tax > ZERO) {
    lines.push({
      accountCode: "1500",
      accountName: "仮払消費税",
      credit: ZERO,
      debit: taxInfo.tax,
      taxCategory: "non_taxable",
    });
  }

  lines.push({
    accountCode: "2110",
    accountName: "未払金",
    credit: extracted.amount,
    debit: ZERO,
    taxCategory: "non_taxable",
  });

  return {
    confidence: classification.confidence,
    date: extracted.date,
    description: `${extracted.counterparty} ${findAccount(classification.accountCode)?.name ?? ""}`,
    id: generateJournalId(),
    lines,
    reasoning: classification.reasoning,
    status: "draft",
    transactionId: extracted.id,
  };
};

const processTransaction = (
  params: ProcessTransactionParams,
): { extracted: ExtractedTransaction; entry: JournalEntry; fromKnowledge: boolean } => {
  const extracted = extractTransaction(params.rawText, params.transactionId);

  const knowledgeResult = classifyWithKnowledge(params.store, extracted);
  if (knowledgeResult) {
    return {
      entry: buildJournalEntry(extracted, knowledgeResult),
      extracted,
      fromKnowledge: true,
    };
  }

  const mockResult = classifyWithMock(extracted);
  return {
    entry: buildJournalEntry(extracted, mockResult),
    extracted,
    fromKnowledge: false,
  };
};

export { buildJournalEntry, classifyWithMock, extractTransaction, processTransaction };
export type { AgentConfig, ClassificationResult, ProcessTransactionParams };
