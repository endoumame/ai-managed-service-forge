/**
 * AIエージェント層 — 仕訳分類エージェント
 *
 * なぜエージェント層を分離するか:
 * AI推論は「推論のアップサイドが大きく、ミスのダウンサイドが小さい」部分に限定する。
 * 仕訳の勘定科目推定は候補が多く、過去パターンの類推が必要な推論タスクである。
 * ただし最終的な金額計算・バランスチェックは決定論的コード層が保証する。
 *
 * モックモードとAPIモードの切り替え:
 * 環境変数 MOCK_AI=true でモックモード（API Key不要でデモ可能）
 */

import type { ClassificationRule, Invoice, JournalEntry, JournalLine } from "../types.ts";
import { findMatchingRule } from "../knowledge/store.ts";
import { generateJournalId } from "../deterministic/rules.ts";

/** AIの確信度閾値（これを下回るとヒューマンレビュー） */
const CONFIDENCE_THRESHOLD = 0.8;

/** ルールベース推定時の確信度 */
const RULE_BASED_CONFIDENCE = 0.95;

/** フォールバック推定時の確信度 */
const FALLBACK_CONFIDENCE = 0.6;

/** デフォルトの標準税率 */
const STANDARD_TAX_RATE = 0.1;

/** 貸借の金額ゼロ */
const ZERO_AMOUNT = 0;

/** 先頭要素のインデックス */
const FIRST_INDEX = 0;

/** 請求書の先頭明細の摘要を取得 */
const getFirstItemDescription = (invoice: Invoice): string => {
  const firstItem = invoice.items.at(FIRST_INDEX);
  return firstItem?.description ?? "";
};

/** 勘定科目のデフォルトマッピング（モックモード用） */
const DEFAULT_ACCOUNT_MAP: Record<string, { code: string; name: string }> = {
  クラウド: { code: "6340", name: "通信費" },
  コピー用紙: { code: "6100", name: "消耗品費" },
  コンサル: { code: "6310", name: "支払手数料" },
  サーバー: { code: "6340", name: "通信費" },
  デザイン: { code: "6200", name: "外注費" },
  ライセンス: { code: "6340", name: "通信費" },
  事務用品: { code: "6100", name: "消耗品費" },
  保守: { code: "6200", name: "外注費" },
  広告: { code: "6400", name: "広告宣伝費" },
  開発: { code: "6200", name: "外注費" },
};

/** 品目説明からキーワードベースで勘定科目を推定（モック用） */
const estimateAccountFromDescription = (
  description: string,
): { code: string; name: string; confidence: number } => {
  for (const keyword of Object.keys(DEFAULT_ACCOUNT_MAP)) {
    if (description.includes(keyword)) {
      return { ...DEFAULT_ACCOUNT_MAP[keyword], confidence: FALLBACK_CONFIDENCE };
    }
  }
  return { code: "6990", confidence: FALLBACK_CONFIDENCE, name: "雑費" };
};

/** ナレッジルールまたはキーワードから仕訳行を生成 */
const buildJournalLines = (
  invoice: Invoice,
  matchedRule: ClassificationRule | null,
): { lines: JournalLine[]; confidence: number } => {
  const account = matchedRule
    ? {
        code: matchedRule.accountCode,
        confidence: RULE_BASED_CONFIDENCE,
        name: matchedRule.accountName,
      }
    : estimateAccountFromDescription(getFirstItemDescription(invoice));

  const debitLine: JournalLine = {
    accountCode: account.code,
    accountName: account.name,
    credit: ZERO_AMOUNT,
    debit: invoice.totalAmount,
    taxRate: STANDARD_TAX_RATE,
  };

  const creditLine: JournalLine = {
    accountCode: "2100",
    accountName: "買掛金",
    credit: invoice.totalAmount,
    debit: ZERO_AMOUNT,
  };

  return { confidence: account.confidence, lines: [debitLine, creditLine] };
};

/**
 * 請求書から仕訳エントリを生成（モックモード）
 * ナレッジストアのルールを参照し、マッチすれば高確信度で推定
 */
const classifyInvoiceMock = (
  invoice: Invoice,
  knowledgeRules: ClassificationRule[],
): JournalEntry => {
  const matchedRule = findMatchingRule(
    knowledgeRules,
    invoice.vendor,
    getFirstItemDescription(invoice),
  );

  const { confidence, lines } = buildJournalLines(invoice, matchedRule);
  const status = confidence >= CONFIDENCE_THRESHOLD ? "proposed" : "needs_review";

  return {
    confidence,
    date: invoice.issueDate,
    description: `${invoice.vendor} ${invoice.invoiceNumber}`,
    id: generateJournalId(),
    invoiceId: invoice.id,
    lines,
    status,
  };
};

/** 仕訳分類のメインエントリポイント */
const classifyInvoice = (invoice: Invoice, knowledgeRules: ClassificationRule[]): JournalEntry =>
  classifyInvoiceMock(invoice, knowledgeRules);

export { CONFIDENCE_THRESHOLD, classifyInvoice };
