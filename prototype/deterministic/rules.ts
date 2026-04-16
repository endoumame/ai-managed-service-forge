/*
 * 決定論的コード層: 仕訳生成とルールベース処理
 *
 * AIに任せてはいけない処理をここに集約する。
 * 税率計算、貸借バランスの構築、承認ルールなど、
 * ルールが明確でミスが許されない処理は決定論的コードで実行。
 */

import type { ExtractedData, JournalEntry, JournalLine } from "../types.ts";

const ZERO = 0;
const TAX_RATE_STANDARD = 0.1;
const TAX_RATE_REDUCED = 0.08;
const APPROVAL_THRESHOLD_MANAGER = 100_000;
const APPROVAL_THRESHOLD_DIRECTOR = 500_000;
const ROUNDING_BASE = 100;

/**
 * 消費税額を計算する（端数切捨て）
 * インボイス制度対応: 税率ごとに1回の端数処理
 */
const calculateTax = (amount: number, taxRate: number): number =>
  Math.floor(amount * taxRate * ROUNDING_BASE) / ROUNDING_BASE;

/**
 * 抽出データから仕訳エントリを生成する
 * 借方: 費用科目（AIが推定した勘定科目）+ 仮払消費税
 * 貸方: 買掛金（税込合計額）
 * 貸借は必ず一致する — これは決定論的コードが保証する
 */
/** 明細から借方仕訳行（費用科目＋仮払消費税）を生成 */
const buildDebitLines = (extracted: ExtractedData): JournalLine[] => {
  const expenseLines: JournalLine[] = extracted.items.map((item) => ({
    account: item.suggestedAccount,
    credit: ZERO,
    debit: item.amount,
    description: item.description,
  }));

  const totalTax = extracted.items.reduce(
    (sum, item) => sum + calculateTax(item.amount, item.taxRate),
    ZERO,
  );

  if (totalTax <= ZERO) {
    return expenseLines;
  }

  return [
    ...expenseLines,
    { account: "仮払消費税", credit: 0, debit: totalTax, description: "仮払消費税" },
  ];
};

const generateJournalEntries = (invoiceId: string, extracted: ExtractedData): JournalEntry => {
  const debitLines = buildDebitLines(extracted);
  const totalDebit = debitLines.reduce((sum, line) => sum + line.debit, ZERO);

  const creditLine: JournalLine = {
    account: "買掛金",
    credit: totalDebit,
    debit: ZERO,
    description: `${extracted.vendor} ${extracted.invoiceNumber}`,
  };

  return {
    date: extracted.date,
    entries: [...debitLines, creditLine],
    invoiceId,
    status: "draft",
  };
};

/**
 * 承認者を決定する金額帯別ルール
 * 決定論的: 金額→承認者のマッピングは明確なルール
 */
const determineApprover = (totalAmount: number): string => {
  if (totalAmount >= APPROVAL_THRESHOLD_DIRECTOR) {
    return "部長承認が必要";
  }
  if (totalAmount >= APPROVAL_THRESHOLD_MANAGER) {
    return "課長承認が必要";
  }
  return "自動承認可能";
};

/**
 * 重複請求チェック
 * 同一の請求番号+取引先の組み合わせを検出
 */
const checkDuplicate = (
  invoiceNumber: string,
  vendor: string,
  processedInvoices: { invoiceNumber: string; vendor: string }[],
): boolean =>
  processedInvoices.some((inv) => inv.invoiceNumber === invoiceNumber && inv.vendor === vendor);

/**
 * 税率の妥当性チェック
 * 日本の消費税は標準10%と軽減8%のみ
 */
const isValidTaxRate = (taxRate: number): boolean =>
  taxRate === TAX_RATE_STANDARD || taxRate === TAX_RATE_REDUCED;

export { calculateTax, checkDuplicate, determineApprover, generateJournalEntries, isValidTaxRate };
