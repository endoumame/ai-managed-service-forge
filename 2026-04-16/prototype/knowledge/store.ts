// ナレッジ管理: トリアージ結果とフィードバックの永続化
// インメモリストレージ（プロトタイプ用）

const INITIAL_VERSION = 1;
const INDENT = 2;

interface TriageRecord {
  packageName: string;
  vulnerabilityId: string;
  impact: string;
  confidence: number;
  reasoning: string;
  timestamp: string;
  humanFeedback?: "approved" | "rejected" | "corrected";
  correctedImpact?: string;
}

interface KnowledgeBase {
  version: number;
  records: TriageRecord[];
  patterns: LearnedPattern[];
}

interface LearnedPattern {
  id: string;
  description: string;
  packageName: string;
  learnedFrom: string[];
  suggestedImpact: string;
  approvedByHuman: boolean;
}

interface FeedbackInput {
  kb: KnowledgeBase;
  vulnerabilityId: string;
  feedback: "approved" | "rejected" | "corrected";
  correctedImpact?: string;
}

const createEmptyKnowledgeBase = (): KnowledgeBase => ({
  patterns: [],
  records: [],
  version: INITIAL_VERSION,
});

const serializeKnowledgeBase = (kb: KnowledgeBase): string => JSON.stringify(kb, null, INDENT);

const isKnowledgeBase = (value: object): value is KnowledgeBase =>
  "version" in value && "records" in value && "patterns" in value;

const deserializeKnowledgeBase = (raw: string): KnowledgeBase => {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null || !isKnowledgeBase(parsed)) {
    return createEmptyKnowledgeBase();
  }
  return parsed;
};

const addTriageRecord = (kb: KnowledgeBase, record: TriageRecord): KnowledgeBase => ({
  ...kb,
  records: [...kb.records, record],
});

const addHumanFeedback = (input: FeedbackInput): KnowledgeBase => ({
  ...input.kb,
  records: input.kb.records.map((rec) =>
    rec.vulnerabilityId === input.vulnerabilityId
      ? { ...rec, correctedImpact: input.correctedImpact, humanFeedback: input.feedback }
      : rec,
  ),
});

export {
  addHumanFeedback,
  addTriageRecord,
  createEmptyKnowledgeBase,
  deserializeKnowledgeBase,
  serializeKnowledgeBase,
  type FeedbackInput,
  type KnowledgeBase,
  type LearnedPattern,
  type TriageRecord,
};
