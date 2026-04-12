/**
 * ContractShield 決定論的コード層
 *
 * なぜ決定論的コードとAIを分離するか:
 * 契約書のパース（条項番号の抽出、セクション分割）やチェックリスト照合は
 * ルールベースで100%正確に処理できる。これをAIに任せると
 * 「条項を見落とす」「番号を間違える」等のドリフトリスクが生まれる。
 * 確実に処理できる部分は決定論的コードに任せ、AIの推論は
 * 「自然言語の意味理解」に集中させるのがAIマネージドサービスの設計原則。
 */

import type { Clause, ClauseAnalysis, ClauseCategory, Contract } from "../types.ts";
import { REQUIRED_CATEGORIES } from "../types.ts";

/**
 * カテゴリ判定用キーワードマップ
 * 正規表現パターンで条項タイトル・本文からカテゴリを決定論的に分類する
 */
const CATEGORY_PATTERNS: { category: ClauseCategory; patterns: RegExp[] }[] = [
  {
    category: "confidentiality",
    patterns: [/秘密保持/, /機密/, /confidential/i, /non-disclosure/i, /NDA/i],
  },
  {
    category: "liability",
    patterns: [/損害賠償/, /責任の?制限/, /liability/i, /damages?/i],
  },
  {
    category: "term",
    patterns: [/契約期間/, /有効期間/, /term\b/i, /duration/i],
  },
  {
    category: "termination",
    patterns: [/解約/, /解除/, /契約の?終了/, /termination/i, /cancellation/i],
  },
  {
    category: "ip",
    patterns: [/知的財産/, /著作権/, /特許/, /intellectual property/i, /copyright/i],
  },
  {
    category: "payment",
    patterns: [/対価/, /支払/, /報酬/, /料金/, /payment/i, /fee/i, /compensation/i],
  },
  {
    category: "warranty",
    patterns: [/保証/, /瑕疵/, /warranty/i, /guarantee/i],
  },
  {
    category: "indemnification",
    patterns: [/補償/, /免責/, /indemnif/i],
  },
  {
    category: "force_majeure",
    patterns: [/不可抗力/, /force majeure/i, /天災/],
  },
  {
    category: "governing_law",
    patterns: [/準拠法/, /適用法/, /governing law/i, /applicable law/i],
  },
  {
    category: "dispute_resolution",
    patterns: [/紛争/, /管轄/, /仲裁/, /dispute/i, /arbitration/i, /jurisdiction/i],
  },
  {
    category: "general",
    patterns: [/一般条項/, /雑則/, /general/i, /miscellaneous/i],
  },
];

/**
 * 条項のカテゴリを決定論的に分類する
 * キーワードマッチングによるルールベース判定
 */
const classifyClause = (title: string, content: string): ClauseCategory => {
  const text = `${title} ${content}`;
  for (const { category, patterns } of CATEGORY_PATTERNS) {
    if (patterns.some((pat) => pat.test(text))) {
      return category;
    }
  }
  return "unknown";
};

/**
 * 漢数字→アラビア数字の変換テーブル
 * インデックス+1が対応する数値（"一"=index0→1, "十"=index9→10）
 */
const KANJI_DIGITS = "一二三四五六七八九十";
const FIRST_INDEX = 0;
const INITIAL_VALUE = 0;
const NOT_FOUND = -1;
const INDEX_OFFSET = 1;
const TEN = 10;

/** 正規表現キャプチャグループのインデックス */
const CAPTURE_GROUP_1 = 1;
const CAPTURE_GROUP_2 = 2;
const CAPTURE_GROUP_3 = 3;

/** リスクスコア集計用の重み */
const RISK_WEIGHT_HIGH = 3;
const RISK_WEIGHT_MEDIUM = 2;
const RISK_WEIGHT_LOW = 1;
const RISK_WEIGHT_NONE = 0;
const BASE_WEIGHT = 1;

/** 漢字1文字を対応する数値に変換する（該当なしはnull） */
const kanjiCharToNumber = (char: string): number | null => {
  const idx = KANJI_DIGITS.indexOf(char);
  if (idx === NOT_FOUND) {
    return null;
  }
  return idx + INDEX_OFFSET;
};

/** 1文字分の漢数字を累積結果に適用する */
const applyKanjiDigit = (current: number, digit: number): number => {
  if (digit === TEN) {
    return current === INITIAL_VALUE ? TEN : current * TEN;
  }
  return current + digit;
};

/** 漢数字文字列を数値に変換する */
const kanjiToNumber = (raw: string): number => {
  let result = 0;
  for (const char of raw) {
    const val = kanjiCharToNumber(char);
    if (val !== null) {
      result = applyKanjiDigit(result, val);
    }
  }
  return result;
};

/**
 * 条項番号を正規化する（漢数字→アラビア数字）
 */
const normalizeClauseNumber = (raw: string): string => {
  if (/^\d+$/.test(raw)) {
    return raw;
  }
  const num = kanjiToNumber(raw);
  return String(num || raw);
};

/**
 * パースした情報からClauseオブジェクトを構築する
 */
const buildClause = (
  raw: { number: string; title: string; lines: string[] },
  index: number,
): Clause => {
  const content = raw.lines.join("\n").trim();
  const category = classifyClause(raw.title, content);
  return {
    category,
    content,
    id: `clause-${index + INDEX_OFFSET}`,
    number: raw.number,
    title: raw.title,
  };
};

const TITLE_PATTERN = /^(.+(?:契約書|合意書|覚書|Agreement))/;
const CLAUSE_PATTERN = /^第([一二三四五六七八九十百\d]+)条[（(]?([^）)]*)[）)]?\s*(.*)/;

/** 契約書の先頭行からタイトルを抽出する */
const extractTitle = (firstLine: string | undefined): string => {
  const match = firstLine?.match(TITLE_PATTERN);
  return match ? match[CAPTURE_GROUP_1].trim() : "無題の契約書";
};

interface RawClause {
  number: string;
  title: string;
  lines: string[];
}

/** マッチ結果から新しい生条項オブジェクトを生成する */
const createRawClause = (match: RegExpMatchArray): RawClause => ({
  lines: match[CAPTURE_GROUP_3] ? [match[CAPTURE_GROUP_3]] : [],
  number: normalizeClauseNumber(match[CAPTURE_GROUP_1]),
  title: match[CAPTURE_GROUP_2] || match[CAPTURE_GROUP_3] || "",
});

/** 蓄積された生条項をClauseに変換してリストに追加する */
const flushClause = (clauses: Clause[], raw: RawClause | null): void => {
  if (raw) {
    clauses.push(buildClause(raw, clauses.length));
  }
};

/** 1行を処理して蓄積状態を更新する */
const processLine = (
  state: { current: RawClause | null; clauses: Clause[] },
  line: string,
): void => {
  const match = line.match(CLAUSE_PATTERN);
  if (match) {
    flushClause(state.clauses, state.current);
    state.current = createRawClause(match);
  } else if (state.current) {
    state.current.lines.push(line);
  }
};

/** テキスト行群から条項リストを構築する */
const extractClauses = (lines: string[]): Clause[] => {
  const state: { current: RawClause | null; clauses: Clause[] } = {
    clauses: [],
    current: null,
  };
  for (const line of lines) {
    processLine(state, line);
  }
  flushClause(state.clauses, state.current);
  return state.clauses;
};

/**
 * 契約書テキストをパースして構造化データに変換する
 *
 * パース戦略: 「第N条」パターンで条項を分割する。
 * 日本語契約書の標準的な条項番号形式をサポート。
 */
const parseContract = (rawText: string): Contract => {
  const lines = rawText.trim().split("\n");
  const title = extractTitle(lines[FIRST_INDEX]);
  const clauses = extractClauses(lines);
  return { clauses, parties: [], rawText, title };
};

/**
 * 必須条項の存在チェック
 * 契約書に含まれるべき必須カテゴリが全て存在するかを検証する
 */
const checkRequiredCategories = (
  clauses: Clause[],
): {
  found: ClauseCategory[];
  missing: ClauseCategory[];
} => {
  const presentCategories = new Set(clauses.map((cl) => cl.category));
  const found: ClauseCategory[] = [];
  const missing: ClauseCategory[] = [];

  for (const cat of REQUIRED_CATEGORIES) {
    if (presentCategories.has(cat)) {
      found.push(cat);
    } else {
      missing.push(cat);
    }
  }

  return { found, missing };
};

/**
 * リスクスコアの集計と正規化
 * 重み付き平均で全体スコアを算出する
 */
const calculateOverallRiskScore = (analyses: ClauseAnalysis[]): number => {
  if (analyses.length === INITIAL_VALUE) {
    return INITIAL_VALUE;
  }

  const weights: Record<string, number> = {
    high: RISK_WEIGHT_HIGH,
    low: RISK_WEIGHT_LOW,
    medium: RISK_WEIGHT_MEDIUM,
    none: RISK_WEIGHT_NONE,
  };

  let weightedSum = INITIAL_VALUE;
  let totalWeight = INITIAL_VALUE;
  for (const item of analyses) {
    const weight = weights[item.riskLevel] ?? BASE_WEIGHT;
    weightedSum += item.riskScore * (BASE_WEIGHT + weight);
    totalWeight += BASE_WEIGHT + weight;
  }

  return Math.round(weightedSum / totalWeight);
};

export {
  calculateOverallRiskScore,
  checkRequiredCategories,
  classifyClause,
  normalizeClauseNumber,
  parseContract,
};
