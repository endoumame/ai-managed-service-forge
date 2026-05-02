/**
 * ハーネス層: 品質チェック
 *
 * 抽出後・分類後の品質チェックフックを定義する。
 * 決定論的コード層のバリデータを組み合わせて、
 * ハーネスが強制する品質ゲートを構成する。
 */
import type { AccountMaster, ChecklistItem, ExtractedData, JournalEntry } from "../types.ts";
import {
  validateAccountExists,
  validateAmountDeviation,
  validateDateValidity,
  validateDebitCreditBalance,
  validateTaxCalculation,
  validateTaxRates,
} from "../deterministic/rules.ts";
import type { VendorHistory } from "../knowledge/store.ts";

const CONFIDENCE_THRESHOLD = 0.8;
const EMPTY_COUNT = 0;

interface CheckerContext {
  accountMaster: AccountMaster[];
  vendorHistory: VendorHistory | null;
}

/** 抽出後の品質チェック: 必須フィールドの充足を検証 */
const afterExtractChecks = (extracted: ExtractedData): ChecklistItem[] => [
  {
    detail: extracted.vendor.length > EMPTY_COUNT ? extracted.vendor : "取引先名が空",
    id: "vendor-present",
    label: "取引先名あり",
    passed: extracted.vendor.length > EMPTY_COUNT,
  },
  {
    detail: `${extracted.items.length}件の明細`,
    id: "items-present",
    label: "明細行あり",
    passed: extracted.items.length > EMPTY_COUNT,
  },
  validateDateValidity(extracted.invoiceDate, extracted.dueDate),
  validateTaxRates(extracted.items),
  validateTaxCalculation(extracted),
];

/** 分類後の品質チェック: 勘定科目の妥当性と信頼度を検証 */
const afterClassifyChecks = (
  extracted: ExtractedData,
  context: CheckerContext,
): ChecklistItem[] => {
  const lowConfidenceItems = extracted.items.filter(
    (item) => item.accountConfidence < CONFIDENCE_THRESHOLD,
  );

  const baseChecks: ChecklistItem[] = [
    validateAccountExists(extracted.items, context.accountMaster),
    {
      detail:
        lowConfidenceItems.length > EMPTY_COUNT
          ? `低信頼度: ${lowConfidenceItems.map((item) => `${item.description}(${item.accountConfidence})`).join(", ")}`
          : `全項目が信頼度${CONFIDENCE_THRESHOLD}以上`,
      id: "confidence-check",
      label: "信頼度チェック",
      passed: lowConfidenceItems.length === EMPTY_COUNT,
    },
  ];

  if (context.vendorHistory !== null) {
    return [...baseChecks, validateAmountDeviation(extracted.totalAmount, context.vendorHistory)];
  }

  return baseChecks;
};

/** 仕訳生成後の品質チェック */
const afterJournalizeChecks = (journal: JournalEntry): ChecklistItem[] => [
  validateDebitCreditBalance(journal),
];

export type { CheckerContext };
export { afterClassifyChecks, afterExtractChecks, afterJournalizeChecks };
