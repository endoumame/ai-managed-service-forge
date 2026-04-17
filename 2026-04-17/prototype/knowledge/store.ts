/* oxlint-disable import/no-nodejs-modules -- プロトタイプのためNode.js FSモジュールを使用 */
/* oxlint-disable @typescript-eslint/no-unsafe-assignment -- 動的importの型推論がtsconfigなしでは不完全 */
/* oxlint-disable @typescript-eslint/no-unsafe-call -- 動的importの型推論がtsconfigなしでは不完全 */
/* oxlint-disable @typescript-eslint/no-unsafe-member-access -- 動的importの型推論がtsconfigなしでは不完全 */
/* oxlint-disable @typescript-eslint/no-unsafe-type-assertion -- 動的importの型推論がtsconfigなしでは不完全 */
/* oxlint-disable @typescript-eslint/no-unsafe-argument -- 動的importの型推論がtsconfigなしでは不完全 */
// ナレッジ管理: ストレージ
// レビュー結果とフィードバックをJSONファイルに永続化

interface ReviewRecord {
  id: string;
  timestamp: string;
  contractSummary: string;
  riskScores: Record<string, number>;
  feedback: FeedbackEntry[];
}

interface FeedbackEntry {
  category: string;
  originalScore: number;
  correctedScore: number | null;
  comment: string;
  timestamp: string;
}

interface KnowledgeBase {
  reviews: ReviewRecord[];
  ruleAdjustments: RuleAdjustment[];
  version: number;
}

interface RuleAdjustment {
  category: string;
  weightDelta: number;
  reason: string;
  approved: boolean;
  timestamp: string;
}

interface FeedbackInput {
  reviewId: string;
  category: string;
  correctedScore: number | null;
  comment: string;
}

const INITIAL_VERSION = 1;
const SUMMARY_MAX_LENGTH = 100;
const JSON_INDENT = 2;
const DEFAULT_SCORE = 0;

const createEmptyKnowledgeBase = (): KnowledgeBase => ({
  reviews: [],
  ruleAdjustments: [],
  version: INITIAL_VERSION,
});

const loadKnowledgeBase = async (filePath: string): Promise<KnowledgeBase> => {
  try {
    const fs = await import("node:fs/promises");
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content) as KnowledgeBase;
  } catch {
    return createEmptyKnowledgeBase();
  }
};

const saveKnowledgeBase = async (filePath: string, kb: KnowledgeBase): Promise<void> => {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const serialized = JSON.stringify(kb, null, JSON_INDENT);
  await fs.writeFile(filePath, serialized, "utf8");
};

const addReviewRecord = (
  kb: KnowledgeBase,
  contractText: string,
  riskScores: Record<string, number>,
): KnowledgeBase => {
  const record: ReviewRecord = {
    contractSummary: contractText.slice(DEFAULT_SCORE, SUMMARY_MAX_LENGTH),
    feedback: [],
    id: `review-${Date.now()}`,
    riskScores,
    timestamp: new Date().toISOString(),
  };
  return { ...kb, reviews: [...kb.reviews, record] };
};

const addFeedback = (kb: KnowledgeBase, input: FeedbackInput): KnowledgeBase => {
  const entry: FeedbackEntry = {
    category: input.category,
    comment: input.comment,
    correctedScore: input.correctedScore,
    originalScore: DEFAULT_SCORE,
    timestamp: new Date().toISOString(),
  };

  const reviews = kb.reviews.map((review) => {
    if (review.id !== input.reviewId) {
      return review;
    }
    const original = review.riskScores[input.category];
    return {
      ...review,
      feedback: [
        ...review.feedback,
        { ...entry, originalScore: typeof original === "number" ? original : DEFAULT_SCORE },
      ],
    };
  });

  return { ...kb, reviews };
};

export {
  type ReviewRecord,
  type FeedbackEntry,
  type KnowledgeBase,
  type RuleAdjustment,
  type FeedbackInput,
  createEmptyKnowledgeBase,
  loadKnowledgeBase,
  saveKnowledgeBase,
  addReviewRecord,
  addFeedback,
};
