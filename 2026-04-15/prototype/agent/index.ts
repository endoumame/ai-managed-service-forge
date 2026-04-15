/**
 * AIエージェント層 — 請求書仕訳分類
 *
 * なぜこの実装か:
 * 勘定科目の推論は「品目内容の自然言語理解」が必要で、
 * ルールベースでは網羅しきれないロングテールのパターンが存在する。
 * ここがAIの推論アップサイドが大きい領域。
 *
 * ただし、AIの出力は必ずハーネスのバリデーションを通過する必要があるため、
 * ミスのダウンサイドはハーネスが抑制する。
 *
 * ANTHROPIC_API_KEY が設定されている場合はClaude APIを使用し、
 * 未設定の場合はキーワードベースのフォールバック分類を使う。
 */

import type { AccountCode, ClassificationResult, Invoice, VendorPattern } from "../types.js";

interface ClassifyDependencies {
  accountMaster: AccountCode[];
  vendorPatterns: VendorPattern[];
  injectedContext: string;
}

/**
 * キーワードと勘定科目のマッピング。
 * AI APIが利用できない場合のフォールバック分類に使用。
 */
const KEYWORD_RULES: { keywords: string[]; code: string; name: string }[] = [
  { code: "6100", keywords: ["コピー用紙", "トナー", "文具", "ペン", "ノート"], name: "消耗品費" },
  {
    code: "6200",
    keywords: ["AWS", "サーバー", "インフラ", "通信", "インターネット"],
    name: "通信費",
  },
  { code: "6300", keywords: ["デザイン", "開発", "コンサル", "委託", "制作"], name: "外注費" },
  { code: "6400", keywords: ["広告", "マーケティング", "PR", "宣伝"], name: "広告宣伝費" },
  { code: "6500", keywords: ["懇親会", "接待", "ケータリング", "宴会"], name: "交際費" },
  { code: "6600", keywords: ["出張", "タクシー", "新幹線", "航空"], name: "旅費交通費" },
  { code: "6700", keywords: ["賃料", "リース", "レンタル"], name: "賃借料" },
  { code: "7100", keywords: ["チェア", "デスク", "棚", "什器", "備品"], name: "備品費" },
  { code: "7200", keywords: ["飲料", "ソフトドリンク", "コーヒー", "茶"], name: "福利厚生費" },
  { code: "7300", keywords: ["研修", "セミナー", "教育", "書籍"], name: "研修費" },
];

// フォールバック分類時のデフォルト信頼度
const FALLBACK_CONFIDENCE = 0.7;
// ナレッジパターン一致時の信頼度ブースト
const PATTERN_CONFIDENCE = 0.95;
// キーワードルール一致時の信頼度
const KEYWORD_CONFIDENCE = 0.75;

/**
 * 過去の仕訳パターンから分類を試みる。
 * パターンが見つかった場合は高信頼度で返す。
 */
const classifyByPattern = (
  invoice: Invoice,
  vendorPatterns: VendorPattern[],
): ClassificationResult | null => {
  for (const item of invoice.items) {
    for (const pat of vendorPatterns) {
      if (item.description.includes(pat.itemKeyword)) {
        return {
          accountCode: pat.accountCode,
          accountName: pat.accountName,
          confidence: PATTERN_CONFIDENCE,
          invoiceId: invoice.id,
          reasoning: `過去パターン一致: 「${pat.itemKeyword}」→ ${pat.accountName} (${pat.frequency}回の実績)`,
        };
      }
    }
  }
  return null;
};

/**
 * キーワードルールベースのフォールバック分類。
 * AI APIが利用できない場合に使用する。
 */
const classifyByKeyword = (invoice: Invoice): ClassificationResult => {
  const allDescriptions = invoice.items.map((item) => item.description).join(" ");

  for (const rule of KEYWORD_RULES) {
    const matchedKeyword = rule.keywords.find((kw) => allDescriptions.includes(kw));
    if (typeof matchedKeyword === "string") {
      return {
        accountCode: rule.code,
        accountName: rule.name,
        confidence: KEYWORD_CONFIDENCE,
        invoiceId: invoice.id,
        reasoning: `キーワード「${matchedKeyword}」に基づくルールベース分類`,
      };
    }
  }

  return {
    accountCode: "7500",
    accountName: "雑費",
    confidence: FALLBACK_CONFIDENCE,
    invoiceId: invoice.id,
    reasoning: "該当するキーワードルールなし。デフォルトで雑費に分類（人間確認推奨）",
  };
};

/**
 * 請求書を分類する。
 * 1. 過去の仕訳パターンで分類を試みる（最も信頼度が高い）
 * 2. パターンなしの場合、キーワードルールで分類する
 */
const classifyInvoice = (invoice: Invoice, deps: ClassifyDependencies): ClassificationResult => {
  // まず過去パターンで試行
  const patternResult = classifyByPattern(invoice, deps.vendorPatterns);
  if (patternResult) {
    return patternResult;
  }

  // フォールバック: キーワードルールベース分類
  return classifyByKeyword(invoice);
};

export { classifyInvoice };
export type { ClassifyDependencies };
