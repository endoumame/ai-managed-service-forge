/**
 * 決定論的コード層: ルールベース処理
 *
 * なぜAIに任せないか:
 * 税率計算、仕訳コードバリデーション、重複検出は「正解が一意に決まる」処理。
 * AIの推論を介在させると、稀にハルシネーションで誤った結果を返すリスクがある。
 * 決定論的コードで100%正確に処理することで、信頼性を担保する。
 */

import type { InvoiceData, JournalEntry, ValidationResult } from "../harness/types.js";

/** 勘定科目マスタ（プロトタイプ用の最小セット） */
const ACCOUNT_MASTER: Record<string, string> = {
  "2100": "買掛金",
  "2200": "未払金",
  "2300": "未払費用",
  "5100": "仕入高",
  "5200": "外注費",
  "5300": "消耗品費",
  "5400": "通信費",
  "5500": "旅費交通費",
  "5600": "接待交際費",
  "5700": "広告宣伝費",
  "5800": "地代家賃",
  "5900": "水道光熱費",
  "6000": "支払手数料",
  "6100": "保険料",
  "6200": "修繕費",
  "6300": "租税公課",
  "6400": "減価償却費",
  "6500": "雑費",
};

/** 税額の許容誤差（円） */
const TAX_TOLERANCE_YEN = 1;
/** 税額集計の初期値 */
const INITIAL_TAX_AMOUNT = 0;
/** 金額異常の上限閾値 */
const ANOMALY_UPPER_THRESHOLD = 100_000_000;
/** Reduce初期値 */
const REDUCE_INITIAL = 0;
/** SetHours引数（深夜0時リセット用） */
const MIDNIGHT_HOURS = 0;

/** エラー・警告配列からValidationResultを構築する */
const buildResult = (errors: string[], warnings: string[]): ValidationResult => ({
  errors,
  valid: errors.length === REDUCE_INITIAL,
  warnings,
});

/**
 * 税額を計算する（端数切り捨て）
 *
 * なぜ切り捨てか: インボイス制度では税率ごとに1回の端数処理が原則。
 * 切り捨て・切り上げ・四捨五入は事業者の選択だが、切り捨てが最も一般的。
 */
const calculateTax = (subtotal: number, taxRate: number): number => Math.floor(subtotal * taxRate);

/** 品目リストから税率ごとに税額を集計する */
const computeTotalTax = (lineItems: InvoiceData["lineItems"]): number => {
  const taxByRate = new Map<number, number>();
  for (const item of lineItems) {
    const current = taxByRate.get(item.taxRate) ?? INITIAL_TAX_AMOUNT;
    taxByRate.set(item.taxRate, current + item.amount);
  }
  let total = INITIAL_TAX_AMOUNT;
  for (const [rate, amount] of taxByRate) {
    total += calculateTax(amount, rate);
  }
  return total;
};

/** 税額差異をエラー/警告に分類する */
const classifyTaxDiff = (calculated: number, stated: number): ValidationResult => {
  const diff = Math.abs(calculated - stated);
  if (diff > TAX_TOLERANCE_YEN) {
    return {
      errors: [`税額不一致: 計算値=${calculated}円, 記載値=${stated}円 (差額=${diff}円)`],
      valid: false,
      warnings: [],
    };
  }
  if (diff === TAX_TOLERANCE_YEN) {
    return {
      errors: [],
      valid: true,
      warnings: [
        `税額に1円の差異あり（端数処理の差異と推定）: 計算値=${calculated}円, 記載値=${stated}円`,
      ],
    };
  }
  return { errors: [], valid: true, warnings: [] };
};

/**
 * 品目ごとの税額を集計し、請求書記載の税額と照合する
 * 許容誤差: ±1円（端数処理の差異を許容）
 */
const validateTaxCalculation = (invoice: InvoiceData): ValidationResult => {
  if (invoice.taxAmount === null || invoice.subtotal === null) {
    return { errors: ["税額または小計が未抽出のため検証できません"], valid: false, warnings: [] };
  }
  const calculatedTax = computeTotalTax(invoice.lineItems);
  return classifyTaxDiff(calculatedTax, invoice.taxAmount);
};

/**
 * 仕訳コードが勘定科目マスタに存在するか検証する
 */
const validateAccountCodes = (entries: JournalEntry[]): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const entry of entries) {
    if (!ACCOUNT_MASTER[entry.debitAccountCode]) {
      errors.push(`借方勘定科目コード「${entry.debitAccountCode}」はマスタに存在しません`);
    }
    if (!ACCOUNT_MASTER[entry.creditAccountCode]) {
      errors.push(`貸方勘定科目コード「${entry.creditAccountCode}」はマスタに存在しません`);
    }
  }

  return buildResult(errors, warnings);
};

/**
 * 貸借バランスの検証
 * 借方合計 = 貸方合計 でなければならない
 */
const validateDebitCreditBalance = (entries: JournalEntry[]): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  const totalDebit = entries.reduce((sum, entry) => sum + entry.amount, REDUCE_INITIAL);
  if (totalDebit === REDUCE_INITIAL) {
    errors.push("仕訳の合計金額が0円です");
  }

  return buildResult(errors, warnings);
};

/**
 * 重複請求書の検出
 * 請求書番号 + 取引先 + 金額 のハッシュで比較
 */
const checkDuplicate = (
  invoice: InvoiceData,
  processedInvoices: {
    invoiceNumber: string;
    vendor: string;
    totalAmount: number;
  }[],
): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (
    invoice.invoiceNumber === null ||
    invoice.invoiceNumber === "" ||
    invoice.vendor === null ||
    invoice.vendor === "" ||
    invoice.totalAmount === null
  ) {
    warnings.push("請求書番号・取引先・金額のいずれかが未抽出のため、重複チェックは限定的です");
    return { errors, valid: true, warnings };
  }

  const duplicate = processedInvoices.find(
    (prev) =>
      prev.invoiceNumber === invoice.invoiceNumber &&
      prev.vendor === invoice.vendor &&
      prev.totalAmount === invoice.totalAmount,
  );

  if (duplicate) {
    errors.push(
      `重複の可能性: 請求書番号「${invoice.invoiceNumber}」（取引先: ${invoice.vendor}, 金額: ${invoice.totalAmount}円）は処理済みです`,
    );
  }

  return buildResult(errors, warnings);
};

/** 金額の異常をチェック */
const checkAmountAnomalies = (
  totalAmount: number | null,
): { errors: string[]; warnings: string[] } => {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (totalAmount !== null && totalAmount <= REDUCE_INITIAL) {
    errors.push(`合計金額が0以下です: ${totalAmount}円`);
  }
  if (totalAmount !== null && totalAmount >= ANOMALY_UPPER_THRESHOLD) {
    warnings.push(
      `合計金額が1億円以上です（${totalAmount.toLocaleString()}円）。確認をお勧めします`,
    );
  }
  return { errors, warnings };
};

/** 日付の異常をチェック */
const checkDateAnomalies = (issueDate: string | null): string[] => {
  if (issueDate === null || issueDate === "") {
    return [];
  }
  const parsed = new Date(issueDate);
  const today = new Date();
  today.setHours(MIDNIGHT_HOURS, MIDNIGHT_HOURS, MIDNIGHT_HOURS, MIDNIGHT_HOURS);
  return parsed > today ? [`発行日が未来日です: ${issueDate}`] : [];
};

/**
 * 異常値チェック
 * - 金額が0以下
 * - 日付が未来日（請求日が今日より先）
 * - 金額が極端に大きい（プロトタイプでは1億円以上を警告）
 */
const checkAnomalies = (invoice: InvoiceData): ValidationResult => {
  const amount = checkAmountAnomalies(invoice.totalAmount);
  const dateWarnings = checkDateAnomalies(invoice.issueDate);
  const { errors } = amount;
  const warnings = [...amount.warnings, ...dateWarnings];
  return buildResult(errors, warnings);
};

/**
 * 適格請求書発行事業者番号の形式チェック
 * T + 13桁の数字
 */
const validateRegistrationNumber = (regNumber: string | null): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (regNumber === null || regNumber === "") {
    warnings.push("適格請求書発行事業者番号が記載されていません（非適格の可能性）");
    return { errors, valid: true, warnings };
  }

  if (!/^T\d{13}$/.test(regNumber)) {
    errors.push(
      `適格請求書発行事業者番号の形式が不正です: 「${regNumber}」（正しい形式: T + 13桁数字）`,
    );
  }

  return buildResult(errors, warnings);
};

export {
  ACCOUNT_MASTER,
  calculateTax,
  checkAnomalies,
  checkDuplicate,
  validateAccountCodes,
  validateDebitCreditBalance,
  validateRegistrationNumber,
  validateTaxCalculation,
};
