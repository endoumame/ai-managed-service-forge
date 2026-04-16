/**
 * ナレッジストア
 *
 * なぜこの実装か:
 * AIマネージドサービスの核心的価値は「使うほど賢くなる」こと。
 * ユーザーの修正フィードバックを「取引先×品目→仕訳科目」のマッピングとして
 * 永続化し、次回以降の処理精度を向上させる。
 *
 * プロトタイプではインメモリ + JSON文字列で管理する。
 * 本番ではDBに置き換え可能なインターフェースで設計している。
 */

/** 仕訳パターンのマッピングレコード */
interface JournalPattern {
  vendorName: string;
  description: string;
  accountCode: string;
  accountName: string;
  usageCount: number;
  lastUsedAt: string;
  approvedByHuman: boolean;
}

/** ナレッジストア全体の型 */
interface KnowledgeData {
  patterns: JournalPattern[];
  corrections: CorrectionRecord[];
  version: number;
}

/** 人間による修正の記録 */
interface CorrectionRecord {
  vendorName: string;
  description: string;
  originalAccountCode: string;
  correctedAccountCode: string;
  correctedAt: string;
  reason?: string;
}

const INITIAL_VERSION = 1;
const INITIAL_USAGE_COUNT = 1;

const createEmptyKnowledge = (): KnowledgeData => ({
  corrections: [],
  patterns: [],
  version: INITIAL_VERSION,
});

/** JSON文字列からナレッジを読み込み（プロトタイプ用の簡易パーサー） */
const loadKnowledgeFromJSON = (json: string): KnowledgeData => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- prototype JSON parsing
  const parsed = JSON.parse(json) as KnowledgeData;
  return parsed;
};

/** ナレッジをJSON文字列にシリアライズ */
const JSON_INDENT = 2;
const serializeKnowledge = (data: KnowledgeData): string => JSON.stringify(data, null, JSON_INDENT);

/** 過去パターンから仕訳科目を検索 */
const findPattern = (
  knowledge: KnowledgeData,
  vendorName: string,
  description: string,
): JournalPattern | undefined =>
  knowledge.patterns.find((pt) => pt.vendorName === vendorName && pt.description === description);

interface UpsertPatternInput {
  vendorName: string;
  description: string;
  accountCode: string;
  accountName: string;
  approvedByHuman: boolean;
}

/** パターンの登録または更新 */
const upsertPattern = (knowledge: KnowledgeData, input: UpsertPatternInput): void => {
  const existing = findPattern(knowledge, input.vendorName, input.description);
  if (existing) {
    existing.accountCode = input.accountCode;
    existing.accountName = input.accountName;
    existing.usageCount += INITIAL_USAGE_COUNT;
    existing.lastUsedAt = new Date().toISOString();
    existing.approvedByHuman = existing.approvedByHuman || input.approvedByHuman;
  } else {
    knowledge.patterns.push({
      ...input,
      lastUsedAt: new Date().toISOString(),
      usageCount: INITIAL_USAGE_COUNT,
    });
  }
};

interface RecordCorrectionInput {
  vendorName: string;
  description: string;
  originalCode: string;
  correctedCode: string;
  reason?: string;
}

/** 修正記録の追加 */
const recordCorrection = (knowledge: KnowledgeData, input: RecordCorrectionInput): void => {
  knowledge.corrections.push({
    correctedAccountCode: input.correctedCode,
    correctedAt: new Date().toISOString(),
    description: input.description,
    originalAccountCode: input.originalCode,
    reason: input.reason,
    vendorName: input.vendorName,
  });
};

/** 取引先が既知かどうかを判定 */
const isKnownVendor = (knowledge: KnowledgeData, vendorName: string): boolean =>
  knowledge.patterns.some((pt) => pt.vendorName === vendorName);

/** 過去パターンのMapを生成（ハーネスのafterClassifyフック用） */
const buildHistoricalPatterns = (knowledge: KnowledgeData): Map<string, string[]> => {
  const patternMap = new Map<string, string[]>();
  for (const pt of knowledge.patterns) {
    const key = `${pt.vendorName}::${pt.description}`;
    const existing = patternMap.get(key) ?? [];
    if (!existing.includes(pt.accountCode)) {
      existing.push(pt.accountCode);
    }
    patternMap.set(key, existing);
  }
  return patternMap;
};

export {
  buildHistoricalPatterns,
  createEmptyKnowledge,
  findPattern,
  isKnownVendor,
  loadKnowledgeFromJSON,
  recordCorrection,
  serializeKnowledge,
  upsertPattern,
};
export type { CorrectionRecord, JournalPattern, KnowledgeData };
