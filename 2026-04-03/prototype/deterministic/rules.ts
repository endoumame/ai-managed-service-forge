/**
 * 決定論的コード層 — ルールベース処理
 *
 * なぜAIではなく決定論的コードか:
 * 金額計算・完全一致マッチング・整合性チェックは「正解が一意に決まる」処理。
 * AIに任せると「だいたい合ってる」で通してしまうリスクがある。
 * 会計処理では1円の誤差も許されないため、決定論的コードで確実に実行する。
 */

import type { BankDeposit, MatchResult, Receivable } from "../types.ts";

/**
 * 一般的な振込手数料（円）
 * 全銀ネット手数料改定(2021年10月)後の一般的な手数料帯をカバー。
 */
const FEE_TIER_1 = 110;
const FEE_TIER_2 = 220;
const FEE_TIER_3 = 330;
const FEE_TIER_4 = 440;
const FEE_TIER_5 = 550;
const FEE_TIER_6 = 660;
const FEE_TIER_7 = 770;
const FEE_TIER_8 = 880;
const TRANSFER_FEE_RANGE = [
  FEE_TIER_1,
  FEE_TIER_2,
  FEE_TIER_3,
  FEE_TIER_4,
  FEE_TIER_5,
  FEE_TIER_6,
  FEE_TIER_7,
  FEE_TIER_8,
];

interface MatchOutput {
  matched: MatchResult[];
  unmatchedDeposits: BankDeposit[];
  unmatchedReceivables: Receivable[];
}

/** マッチングの中間状態 */
interface MatchState {
  matched: MatchResult[];
  unmatchedDeposits: BankDeposit[];
  matchedReceivableIds: Set<string>;
}

/** 売掛金を税込金額でインデックス化する */
const buildAmountIndex = (receivables: Receivable[]): Map<number, Receivable[]> => {
  const index = new Map<number, Receivable[]>();
  for (const rec of receivables) {
    const existing = index.get(rec.amountWithTax) ?? [];
    existing.push(rec);
    index.set(rec.amountWithTax, existing);
  }
  return index;
};

/** MatchStateからMatchOutputに変換する */
const toMatchOutput = (state: MatchState, receivables: Receivable[]): MatchOutput => ({
  matched: state.matched,
  unmatchedDeposits: state.unmatchedDeposits,
  unmatchedReceivables: receivables.filter((rec) => !state.matchedReceivableIds.has(rec.id)),
});

/** 空のMatchStateを生成する */
const createMatchState = (): MatchState => ({
  matched: [],
  matchedReceivableIds: new Set<string>(),
  unmatchedDeposits: [],
});

/** 1件の入金を金額完全一致でマッチングする */
const matchExact = (
  deposit: BankDeposit,
  index: Map<number, Receivable[]>,
  state: MatchState,
): void => {
  const candidates = index.get(deposit.amount);
  const receivable = candidates?.find((rec) => !state.matchedReceivableIds.has(rec.id));
  if (receivable) {
    state.matchedReceivableIds.add(receivable.id);
    state.matched.push({
      category: "auto_confirmed",
      confidence: 1,
      deposit,
      matchMethod: "exact_amount",
      reason: `金額完全一致: ¥${deposit.amount.toLocaleString()} = 請求書 ${receivable.invoiceNumber}`,
      receivable,
    });
  } else {
    state.unmatchedDeposits.push(deposit);
  }
};

/**
 * 金額完全一致マッチング
 *
 * ハッシュマップを使ったO(n)マッチング。
 * 税込金額での完全一致を最優先で処理する。
 */
const exactAmountMatch = (deposits: BankDeposit[], receivables: Receivable[]): MatchOutput => {
  const index = buildAmountIndex(receivables);
  const state = createMatchState();
  for (const deposit of deposits) {
    matchExact(deposit, index, state);
  }
  return toMatchOutput(state, receivables);
};

/** 1件の入金に対して手数料差額でマッチする売掛金を探す */
const findFeeMatch = (
  deposit: BankDeposit,
  index: Map<number, Receivable[]>,
  matchedIds: Set<string>,
): { receivable: Receivable; fee: number } | null => {
  for (const fee of TRANSFER_FEE_RANGE) {
    const candidates = index.get(deposit.amount + fee);
    const receivable = candidates?.find((rec) => !matchedIds.has(rec.id));
    if (receivable) {
      return { fee, receivable };
    }
  }
  return null;
};

/** 1件の入金を手数料差額でマッチングする */
const matchWithFee = (
  deposit: BankDeposit,
  index: Map<number, Receivable[]>,
  state: MatchState,
): void => {
  const hit = findFeeMatch(deposit, index, state.matchedReceivableIds);
  if (hit) {
    state.matchedReceivableIds.add(hit.receivable.id);
    state.matched.push({
      category: "auto_confirmed",
      confidence: 0.95,
      deposit,
      matchMethod: "amount_with_fee",
      reason: `振込手数料差額一致: ¥${deposit.amount.toLocaleString()} + 手数料¥${hit.fee} = 請求書 ${hit.receivable.invoiceNumber} (¥${hit.receivable.amountWithTax.toLocaleString()})`,
      receivable: hit.receivable,
    });
  } else {
    state.unmatchedDeposits.push(deposit);
  }
};

/**
 * 振込手数料差額マッチング
 *
 * 入金額 + 一般的な振込手数料 = 請求額 となるケースを検出。
 */
const feeAdjustedMatch = (deposits: BankDeposit[], receivables: Receivable[]): MatchOutput => {
  const index = buildAmountIndex(receivables);
  const state = createMatchState();
  for (const deposit of deposits) {
    matchWithFee(deposit, index, state);
  }
  return toMatchOutput(state, receivables);
};

type AgingBucket = "current" | "overdue30" | "overdue60" | "overdue90";

/** ミリ秒→日数変換の定数 */
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const MS_PER_DAY = MS_PER_SECOND * SECONDS_PER_MINUTE * MINUTES_PER_HOUR * HOURS_PER_DAY;

/** エージング閾値（日数） */
const AGING_THRESHOLD_30 = 30;
const AGING_THRESHOLD_60 = 60;

/** 支払期日と基準日からエージング区分を判定する */
const classifyAging = (dueDate: Date, baseDate: Date): AgingBucket => {
  const diffDays = Math.floor((baseDate.getTime() - dueDate.getTime()) / MS_PER_DAY);
  const NOT_OVERDUE = 0;
  if (diffDays <= NOT_OVERDUE) {
    return "current";
  }
  if (diffDays <= AGING_THRESHOLD_30) {
    return "overdue30";
  }
  if (diffDays <= AGING_THRESHOLD_60) {
    return "overdue60";
  }
  return "overdue90";
};

/**
 * 未消込売掛金のエージング計算
 *
 * 支払期日からの経過日数で分類する。
 * これは会計基準に基づく分類であり、AIの判断を介在させない。
 */
const calculateAging = (
  receivables: Receivable[],
  baseDate: Date,
): Record<AgingBucket, Receivable[]> => {
  const result: Record<AgingBucket, Receivable[]> = {
    current: [],
    overdue30: [],
    overdue60: [],
    overdue90: [],
  };
  for (const rec of receivables) {
    const bucket = classifyAging(new Date(rec.dueDate), baseDate);
    result[bucket].push(rec);
  }
  return result;
};

export { calculateAging, exactAmountMatch, feeAdjustedMatch };
