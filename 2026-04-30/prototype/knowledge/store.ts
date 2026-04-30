import type { KnowledgePattern } from "../types.js";

const NO_MATCHES = 0;
const INITIAL_USAGE = 0;
const SIMILARITY_THRESHOLD = 0.5;
const TOP_RESULT = 0;
const COUNTERPARTY_MATCH_SCORE = 1;
const COUNTERPARTY_NO_MATCH_SCORE = 0;
const USAGE_INCREMENT = 1;

interface KnowledgeStore {
  patterns: KnowledgePattern[];
}

const createStore = (initialPatterns?: KnowledgePattern[]): KnowledgeStore => ({
  patterns: initialPatterns ?? [],
});

const serializeStore = (store: KnowledgeStore): string => JSON.stringify(store.patterns);

const isPatternArray = (data: unknown): data is KnowledgePattern[] =>
  Array.isArray(data) &&
  data.every((item) => typeof item === "object" && item !== null && "id" in item);

const deserializeStore = (json: string): KnowledgeStore => {
  const parsed: unknown = JSON.parse(json);
  const patterns = isPatternArray(parsed) ? parsed : [];
  return { patterns };
};

const findMatchingPattern = (
  store: KnowledgeStore,
  counterparty: string,
  description: string,
): KnowledgePattern | undefined => {
  const descWords = description.toLowerCase().split(/\s+/);

  const scored = store.patterns
    .map((pattern) => {
      const counterpartyMatch = pattern.counterparty.toLowerCase() === counterparty.toLowerCase();
      const keywordHits = pattern.descriptionKeywords.filter((kw) =>
        descWords.some((dw) => dw.includes(kw.toLowerCase())),
      ).length;
      const keywordTotal = pattern.descriptionKeywords.length;
      const keywordScore = keywordTotal > NO_MATCHES ? keywordHits / keywordTotal : INITIAL_USAGE;
      const score =
        (counterpartyMatch ? COUNTERPARTY_MATCH_SCORE : COUNTERPARTY_NO_MATCH_SCORE) + keywordScore;
      return { pattern, score };
    })
    .filter((item) => item.score > SIMILARITY_THRESHOLD)
    .toSorted((ab, cd) => cd.score - ab.score);

  return scored[TOP_RESULT]?.pattern;
};

const addPattern = (store: KnowledgeStore, pattern: KnowledgePattern): void => {
  store.patterns.push(pattern);
};

const incrementUsage = (store: KnowledgeStore, patternId: string): void => {
  const pattern = store.patterns.find((pt) => pt.id === patternId);
  if (pattern) {
    pattern.usageCount += USAGE_INCREMENT;
    pattern.lastUsed = new Date().toISOString();
  }
};

const getPatternCount = (store: KnowledgeStore): number => store.patterns.length;

export {
  addPattern,
  createStore,
  deserializeStore,
  findMatchingPattern,
  getPatternCount,
  incrementUsage,
  serializeStore,
};
export type { KnowledgeStore };
