import type { ExtractedTransaction, HookResult, JournalEntry } from "../types.js";
import { checkBalance, validateAccountCodes } from "../deterministic/rules.js";

const REQUIRED_STRING_FIELDS: ("date" | "counterparty" | "description")[] = [
  "date",
  "counterparty",
  "description",
];

const ANOMALY_AMOUNT_MULTIPLIER = 3;
const MIN_VALID_AMOUNT = 0;
const MIN_HISTORICAL_AVERAGE = 0;
const NO_ERRORS = 0;

const validateExtraction = (extracted: ExtractedTransaction): HookResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const field of REQUIRED_STRING_FIELDS) {
    if (extracted[field] === "") {
      errors.push(`必須フィールド「${field}」が未抽出です`);
    }
  }

  if (extracted.amount <= MIN_VALID_AMOUNT) {
    errors.push(`金額が0以下です: ${String(extracted.amount)}`);
  }

  return { errors, passed: errors.length === NO_ERRORS, warnings };
};

const collectJournalErrors = (entry: JournalEntry): string[] => {
  const balanceResult = checkBalance(entry.lines);
  const accountResult = validateAccountCodes(entry);
  return [
    ...(balanceResult.balanced
      ? []
      : [
          `借貸不一致: 借方${String(balanceResult.debitTotal)} / 貸方${String(balanceResult.creditTotal)} (差額: ${String(balanceResult.difference)})`,
        ]),
    ...(accountResult.valid
      ? []
      : [`不明な勘定科目コード: ${accountResult.invalidCodes.join(", ")}`]),
    ...(entry.lines.length === NO_ERRORS ? ["仕訳明細が空です"] : []),
  ];
};

const validateJournal = (entry: JournalEntry): HookResult => {
  const errors = collectJournalErrors(entry);
  return { errors, passed: errors.length === NO_ERRORS, warnings: [] };
};

const checkAmountAnomaly = (currentAmount: number, historicalAverage: number): HookResult => {
  const warnings: string[] = [];
  const threshold = historicalAverage * ANOMALY_AMOUNT_MULTIPLIER;

  if (historicalAverage > MIN_HISTORICAL_AVERAGE && currentAmount > threshold) {
    warnings.push(
      `金額異常: ${String(currentAmount)}円は平均${String(historicalAverage)}円の${String(ANOMALY_AMOUNT_MULTIPLIER)}倍を超えています`,
    );
  }

  return { errors: [], passed: true, warnings };
};

export { checkAmountAnomaly, validateExtraction, validateJournal };
