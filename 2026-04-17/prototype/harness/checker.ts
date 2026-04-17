// ハーネス層: 品質チェック
// AIの出力を決定論的に検証し、ハルシネーションやスキップを検出する

import type { HookContext } from "./lifecycle.js";

const STRING_START = 0;
const QUOTE_MATCH_PREFIX_LENGTH = 20;
const QUOTE_PREVIEW_LENGTH = 30;
const MIN_COVERAGE_RATIO = 0.8;
const FULL_COVERAGE = 1;
const PERCENTAGE = 100;

const truncate = (text: string, maxLen: number): string => text.slice(STRING_START, maxLen);
const normalizeWhitespace = (text: string): string =>
  text.replaceAll(/\s+/g, "").replaceAll(/[\u3000]/g, "");

interface QualityCheckResult {
  passed: boolean;
  checks: {
    name: string;
    passed: boolean;
    detail: string;
  }[];
}

// 引用検証: AIが出力した引用が原文に存在するか
const verifyQuotes = (contractText: string, quotes: string[]): QualityCheckResult => {
  const normalizedContract = normalizeWhitespace(contractText);

  const checks = quotes.map((quote) => {
    const normalizedQuote = normalizeWhitespace(quote);
    const searchTarget = truncate(normalizedQuote, QUOTE_MATCH_PREFIX_LENGTH);
    const found = normalizedContract.includes(searchTarget);
    return {
      detail: found ? "原文に存在を確認" : "原文に見つからず（ハルシネーション疑い）",
      name: `引用検証: "${truncate(quote, QUOTE_PREVIEW_LENGTH)}..."`,
      passed: found,
    };
  });

  return {
    checks,
    passed: checks.every((check) => check.passed),
  };
};

// カバレッジ検証: 契約書の主要セクションが分析対象に含まれているか
const verifyCoverage = (contractText: string, analyzedSections: string[]): QualityCheckResult => {
  const sectionPattern = /第[一二三四五六七八九十\d]+条/g;
  const sections = contractText.match(sectionPattern) ?? [];
  const totalSections = sections.length;
  const analyzedCount = analyzedSections.length;

  const coverageRatio =
    totalSections > STRING_START ? analyzedCount / totalSections : FULL_COVERAGE;
  const passed = coverageRatio >= MIN_COVERAGE_RATIO;

  return {
    checks: [
      {
        detail: `${analyzedCount}/${totalSections} セクション分析済み（${Math.round(coverageRatio * PERCENTAGE)}%）`,
        name: "セクションカバレッジ",
        passed,
      },
    ],
    passed,
  };
};

const hasItems = (arr: unknown[]): boolean => arr.length > STRING_START;

const formatSection = (label: string, items: string[]): string[] =>
  hasItems(items) ? [`\n${label}`, ...items.map((item) => `  - ${item}`)] : [];

// 総合品質レポート生成
const generateQualityReport = (ctx: HookContext): string => {
  const separator = "═══════════════════════════════════";
  const body = [
    ...formatSection("✗ エラー:", ctx.errors),
    ...formatSection("⚠ 警告:", ctx.warnings),
    ...(!hasItems(ctx.errors) && !hasItems(ctx.warnings) ? ["\n✓ 全品質チェック通過"] : []),
  ];
  return [separator, "  品質チェックレポート", separator, ...body, separator].join("\n");
};

export { type QualityCheckResult, verifyQuotes, verifyCoverage, generateQualityReport };
