/**
 * ハーネス層 — ライフサイクルフック定義
 *
 * なぜハーネスが必要か:
 * AIエージェントは「もう十分マッチングできた」と自己申告する傾向がある（ドリフト問題）。
 * ハーネスが外部から「本当に全入金が処理されたか」を検証し、
 * 未処理があればエージェントに差し戻す。
 *
 * ハーネスはシェフ（AI）を包む調理場の設計:
 * - beforeMatch: 調理前の材料チェック（入力データの妥当性）
 * - afterMatch: 調理後の品質検査（マッチング結果の整合性）
 * - beforeFinalize: 盛り付け前の最終確認（全数処理の保証）
 */

import type {
  BankDeposit,
  CompletionChecklist,
  HookResult,
  MatchResult,
  Receivable,
} from "../types.ts";

/** 数値定数 */
const MIN_VALID_AMOUNT = 0;
const NO_ISSUES = 0;
const SINGLE_MATCH = 1;
const MAX_FEE_PER_ITEM = 880;
const SUM_INITIAL = 0;

/** IssuesからHookResultを生成する */
const toHookResult = (issues: string[]): HookResult => ({
  issues,
  passed: issues.length === NO_ISSUES,
});

/** 1件の入金データをバリデーションする */
const validateSingleDeposit = (dep: BankDeposit): string[] => {
  const issues: string[] = [];
  if (dep.amount <= MIN_VALID_AMOUNT) {
    issues.push(`入金ID ${dep.id}: 金額が0以下 (¥${dep.amount})`);
  }
  if (!dep.payerName || dep.payerName.trim() === "") {
    issues.push(`入金ID ${dep.id}: 振込名義が空`);
  }
  return issues;
};

/** 入金データのバリデーション（重複チェック含む） */
const validateDeposits = (deposits: BankDeposit[]): string[] => {
  const issues: string[] = [];
  const depositIds = new Set<string>();
  for (const dep of deposits) {
    issues.push(...validateSingleDeposit(dep));
    if (depositIds.has(dep.id)) {
      issues.push(`入金ID ${dep.id}: 重複`);
    }
    depositIds.add(dep.id);
  }
  return issues;
};

/** 売掛金データのバリデーション */
const validateReceivables = (receivables: Receivable[]): string[] => {
  const issues: string[] = [];
  for (const rec of receivables) {
    if (rec.amountWithTax <= MIN_VALID_AMOUNT) {
      issues.push(`売掛金ID ${rec.id}: 税込金額が0以下 (¥${rec.amountWithTax})`);
    }
    if (rec.amountWithTax < rec.amountWithoutTax) {
      issues.push(`売掛金ID ${rec.id}: 税込金額 < 税抜金額（不整合）`);
    }
  }
  return issues;
};

/** BeforeMatch フック */
const beforeMatch = (deposits: BankDeposit[], receivables: Receivable[]): HookResult => {
  const issues = [...validateDeposits(deposits), ...validateReceivables(receivables)];
  return toHookResult(issues);
};

/** 売掛金IDごとに紐付く入金IDをグルーピングする */
const groupDepositsByReceivable = (results: MatchResult[]): Map<string, string[]> => {
  const map = new Map<string, string[]>();
  for (const res of results) {
    if (res.receivable) {
      const existing = map.get(res.receivable.id) ?? [];
      existing.push(res.deposit.id);
      map.set(res.receivable.id, existing);
    }
  }
  return map;
};

/** 二重マッチング検出 */
const detectDuplicateMatches = (results: MatchResult[]): string[] => {
  const grouped = groupDepositsByReceivable(results);
  const issues: string[] = [];
  for (const [receivableId, depIds] of grouped) {
    if (depIds.length > SINGLE_MATCH) {
      issues.push(
        `二重マッチング検出: 売掛金 ${receivableId} が複数の入金 [${depIds.join(", ")}] にマッチ`,
      );
    }
  }
  return issues;
};

/** 自動確定分の金額不一致検出 */
const detectAmountMismatch = (results: MatchResult[]): string[] => {
  const issues: string[] = [];
  for (const res of results) {
    const isExactAutoConfirm =
      res.category === "auto_confirmed" &&
      res.receivable !== null &&
      res.matchMethod === "exact_amount";
    if (
      isExactAutoConfirm &&
      res.receivable !== null &&
      res.deposit.amount !== res.receivable.amountWithTax
    ) {
      issues.push(
        `金額不一致: 入金 ${res.deposit.id} (¥${res.deposit.amount}) ≠ 売掛金 ${res.receivable.id} (¥${res.receivable.amountWithTax})`,
      );
    }
  }
  return issues;
};

/** AfterMatch フック */
const afterMatch = (results: MatchResult[]): HookResult => {
  const issues = [...detectDuplicateMatches(results), ...detectAmountMismatch(results)];
  return toHookResult(issues);
};

/** 自動確定分の金額整合性を検証する */
const checkAmountIntegrity = (results: MatchResult[]): boolean => {
  const autoConfirmed = results.filter((res) => res.category === "auto_confirmed");
  const depTotal = autoConfirmed.reduce((sum, res) => sum + res.deposit.amount, SUM_INITIAL);
  const recTotal = autoConfirmed.reduce(
    (sum, res) => sum + (res.receivable?.amountWithTax ?? SUM_INITIAL),
    SUM_INITIAL,
  );
  return Math.abs(depTotal - recTotal) <= autoConfirmed.length * MAX_FEE_PER_ITEM;
};

/** チェックリストの各条件を計算する */
const buildChecklist = (
  results: MatchResult[],
  originalDeposits: BankDeposit[],
): CompletionChecklist => {
  const processedIds = new Set(results.map((res) => res.deposit.id));
  const allDepositsProcessed = originalDeposits.every((dep) => processedIds.has(dep.id));
  const amountIntegrityPassed = checkAmountIntegrity(results);

  const receivableIds = results.filter((res) => res.receivable).map((res) => res.receivable!.id); // eslint-disable-line typescript/no-non-null-assertion -- filterで存在確認済み
  const noDuplicateMatches = receivableIds.length === new Set(receivableIds).size;

  const candidates = results.filter((res) => res.category === "candidate");
  const allCandidatesScored = candidates.every((res) => res.confidence !== null);

  return { allCandidatesScored, allDepositsProcessed, amountIntegrityPassed, noDuplicateMatches };
};

/** チェックリストから未充足項目のissuesを生成する */
const checklistToIssues = (checklist: CompletionChecklist): string[] => {
  const issueMap: [boolean, string][] = [
    [checklist.allDepositsProcessed, "未処理の入金があります"],
    [checklist.amountIntegrityPassed, "金額整合性エラー: 自動確定分の差額が許容範囲外"],
    [checklist.noDuplicateMatches, "二重マッチングが検出されています"],
    [checklist.allCandidatesScored, "信頼度スコアが未設定の候補があります"],
  ];
  return issueMap.filter(([passed]) => !passed).map(([, message]) => message);
};

/** BeforeFinalize フック（終了条件の外部管理） */
const beforeFinalize = (
  results: MatchResult[],
  originalDeposits: BankDeposit[],
): { checklist: CompletionChecklist; hookResult: HookResult } => {
  const checklist = buildChecklist(results, originalDeposits);
  const issues = checklistToIssues(checklist);
  return { checklist, hookResult: toHookResult(issues) };
};

export { afterMatch, beforeFinalize, beforeMatch };
