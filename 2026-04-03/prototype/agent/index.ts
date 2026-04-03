/**
 * AIエージェント層 — 曖昧マッチング担当
 *
 * なぜAIが担当するか:
 * 振込名義と取引先名の曖昧マッチングは「正解が一意に決まらない」処理。
 * AIのダウンサイドリスクは小さい:
 * マッチングに失敗しても「候補」として提示するだけで、自動確定はしない。
 */

import type { BankDeposit, KnowledgeEntry, MatchResult, Receivable } from "../types.ts";
import { lookupByPayerName } from "../knowledge/store.ts";

/** マッチング閾値・定数 */
const MIN_SIMILARITY_THRESHOLD = 0.3;
const PROMOTED_CONFIDENCE = 0.98;
const DICTIONARY_CONFIDENCE = 0.85;
const PERCENT_MULTIPLIER = 100;
const ZERO = 0;
const BIGRAM_WINDOW = 2;
const BIGRAM_OFFSET = 1;
const INCREMENT = 1;

/** 企業名を正規化する（bigramの前処理用） */
const normalizeName = (str: string): string =>
  str
    .replaceAll(/[（(）)㈱㈲\s]/g, "")
    .replaceAll(/株式会社|有限会社|合同会社/g, "")
    .toUpperCase();

/** Bigram集合を生成する */
const toBigrams = (str: string): Set<string> => {
  const bigrams = new Set<string>();
  for (let idx = ZERO; idx < str.length - BIGRAM_OFFSET; idx += INCREMENT) {
    bigrams.add(str.slice(idx, idx + BIGRAM_WINDOW));
  }
  return bigrams;
};

/** Jaccard係数を計算する */
const jaccardCoefficient = (setA: Set<string>, setB: Set<string>): number => {
  let intersection = ZERO;
  for (const item of setA) {
    if (setB.has(item)) {
      intersection += INCREMENT;
    }
  }
  return intersection / (setA.size + setB.size - intersection);
};

/** 文字列類似度（Jaccard係数ベース） */
const calculateSimilarity = (strA: string, strB: string): number => {
  const bigramsA = toBigrams(normalizeName(strA));
  const bigramsB = toBigrams(normalizeName(strB));
  if (bigramsA.size === ZERO || bigramsB.size === ZERO) {
    return ZERO;
  }
  return jaccardCoefficient(bigramsA, bigramsB);
};

/** 候補リストから最も類似度の高い売掛金を探す */
const findBestSimilarMatch = (
  payerName: string,
  receivables: Receivable[],
  excludeIds: Set<string | undefined>,
): { receivable: Receivable; score: number } | null => {
  let bestMatch: { receivable: Receivable; score: number } | null = null;
  const candidates = receivables.filter((rec) => !excludeIds.has(rec.id));
  for (const rec of candidates) {
    const score = calculateSimilarity(payerName, rec.clientName);
    if (score > MIN_SIMILARITY_THRESHOLD && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { receivable: rec, score };
    }
  }
  return bestMatch;
};

/** 既にマッチ済みのIDセットを取得する */
const getMatchedIds = (alreadyMatched: MatchResult[]): Set<string | undefined> =>
  new Set(alreadyMatched.map((mr) => mr.receivable?.id).filter(Boolean));

/** ヒューリスティックベースの曖昧マッチング（Claude APIのモック） */
const mockAiFuzzyMatch = (
  deposit: BankDeposit,
  receivables: Receivable[],
  alreadyMatched: MatchResult[],
): MatchResult | null => {
  const bestMatch = findBestSimilarMatch(
    deposit.payerName,
    receivables,
    getMatchedIds(alreadyMatched),
  );
  if (!bestMatch) {
    return null;
  }
  return {
    category: "candidate",
    confidence: bestMatch.score,
    deposit,
    matchMethod: "ai_fuzzy",
    reason: `AI曖昧マッチ: 「${deposit.payerName}」≈「${bestMatch.receivable.clientName}」（信頼度: ${(bestMatch.score * PERCENT_MULTIPLIER).toFixed(ZERO)}%）`,
    receivable: bestMatch.receivable,
  };
};

/** ナレッジ辞書ヒット時のMatchResultを生成する */
const buildKnowledgeMatch = (
  deposit: BankDeposit,
  receivable: Receivable,
  knowledgeHit: KnowledgeEntry,
): MatchResult => ({
  category: knowledgeHit.isPromoted ? "auto_confirmed" : "candidate",
  confidence: knowledgeHit.isPromoted ? PROMOTED_CONFIDENCE : DICTIONARY_CONFIDENCE,
  deposit,
  matchMethod: "ai_fuzzy",
  reason: knowledgeHit.isPromoted
    ? `確定ルール適用: 「${deposit.payerName}」→「${receivable.clientName}」（辞書登録済み・昇格済み）`
    : `辞書マッチ: 「${deposit.payerName}」→「${receivable.clientName}」（使用${knowledgeHit.usageCount}回、未昇格）`,
  receivable,
});

/** マッチングコンテキスト */
interface MatchContext {
  unmatchedReceivables: Receivable[];
  knowledge: KnowledgeEntry[];
  matched: MatchResult[];
}

/** 1件の入金に対してナレッジ辞書またはAIでマッチングを試みる */
const matchSingleDeposit = (deposit: BankDeposit, ctx: MatchContext): MatchResult | null => {
  const knowledgeHit = lookupByPayerName(deposit.payerName, ctx.knowledge);
  if (knowledgeHit) {
    const receivable = ctx.unmatchedReceivables.find(
      (rec) =>
        rec.clientCode === knowledgeHit.clientCode &&
        !ctx.matched.some((mr) => mr.receivable?.id === rec.id),
    );
    if (receivable) {
      return buildKnowledgeMatch(deposit, receivable, knowledgeHit);
    }
  }
  return mockAiFuzzyMatch(deposit, ctx.unmatchedReceivables, ctx.matched);
};

/**
 * AIによる曖昧マッチング
 *
 * プロトタイプではClaude APIの代わりにヒューリスティックベースのモックを使用。
 * 本番では claude-sonnet-4-20250514 を使用する。
 */
const fuzzyMatch = (
  unmatchedDeposits: BankDeposit[],
  unmatchedReceivables: Receivable[],
  knowledge: KnowledgeEntry[],
): { matched: MatchResult[]; remaining: BankDeposit[] } => {
  const matched: MatchResult[] = [];
  const remaining: BankDeposit[] = [];

  for (const deposit of unmatchedDeposits) {
    const ctx: MatchContext = { knowledge, matched, unmatchedReceivables };
    const result = matchSingleDeposit(deposit, ctx);
    if (result) {
      matched.push(result);
    } else {
      remaining.push(deposit);
    }
  }

  return { matched, remaining };
};

export { fuzzyMatch };
