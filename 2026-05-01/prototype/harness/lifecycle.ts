import type {
  ExtractedInvoiceData,
  HookPhase,
  HookResult,
  Invoice,
  JournalEntry,
  KnowledgeBase,
} from "../types.ts";

// oxlint-disable eslint(no-magic-numbers) -- バリデーション定数の定義と境界値比較が本質的に必要

// ハーネスのライフサイクルフック: AIの各処理ステップの前後で決定論的な検証を行う
// AIに自己申告させず、外部から品質を保証する仕組み

const MIN_TEXT_LENGTH = 20;
const CONFIDENCE_THRESHOLD = 0.8;
const PERCENT_MULTIPLIER = 100;
const ROUNDING_TOLERANCE = 1;

const buildResult = (
  errors: string[],
  warnings: string[],
  context?: Record<string, unknown>,
): HookResult => ({
  errors,
  passed: errors.length === 0,
  warnings,
  ...(context ? { context } : {}),
});

const beforeExtract = (invoice: Invoice): HookResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!invoice.rawText || invoice.rawText.trim().length === 0) {
    errors.push("請求書テキストが空です");
  }
  if (invoice.rawText.length < MIN_TEXT_LENGTH) {
    errors.push(`請求書テキストが短すぎます（最低${MIN_TEXT_LENGTH}文字必要）`);
  }

  const hasAmount = /\d+[,，]\d{3}|[\d]+円/.test(invoice.rawText);
  if (!hasAmount) {
    warnings.push("金額らしき数値が見つかりません");
  }

  return buildResult(errors, warnings);
};

const FIELD_RULES: { check: (ex: ExtractedInvoiceData) => boolean; message: string }[] = [
  { check: (ex) => !ex.vendorName, message: "取引先名が抽出されていません" },
  { check: (ex) => !ex.invoiceNumber, message: "請求書番号が抽出されていません" },
  { check: (ex) => !ex.invoiceDate, message: "発行日が抽出されていません" },
  { check: (ex) => ex.items.length === 0, message: "品目が1つも抽出されていません" },
  { check: (ex) => ex.totalAmount <= 0, message: "合計金額が0以下です" },
];

const validateRequiredFields = (extracted: ExtractedInvoiceData): string[] =>
  FIELD_RULES.filter((rule) => rule.check(extracted)).map((rule) => rule.message);

const validateAmounts = (extracted: ExtractedInvoiceData): string[] => {
  const errors: string[] = [];
  const itemsTotal = extracted.items.reduce((sum, item) => sum + item.amount, 0);
  if (Math.abs(itemsTotal - extracted.subtotal) > ROUNDING_TOLERANCE) {
    errors.push(`品目合計(${itemsTotal})と小計(${extracted.subtotal})が一致しません`);
  }
  return errors;
};

const afterExtract = (_invoice: Invoice, extracted: ExtractedInvoiceData): HookResult => {
  const warnings: string[] = [];
  const errors = [...validateRequiredFields(extracted), ...validateAmounts(extracted)];

  if (extracted.dueDate === null) {
    warnings.push("支払期日が抽出されていません");
  }

  return buildResult(errors, warnings);
};

const lookupVendorHistory = (
  vendorName: string,
  knowledgeBase: KnowledgeBase,
): { warnings: string[]; context: Record<string, unknown> } => {
  const vendorMappings = knowledgeBase.accountMappings.filter((mp) => mp.vendorName === vendorName);

  if (vendorMappings.length > 0) {
    return { context: { hasHistory: true, historicalMappings: vendorMappings }, warnings: [] };
  }
  return {
    context: { hasHistory: false },
    warnings: [`新規取引先「${vendorName}」: 過去の仕訳履歴がありません`],
  };
};

const beforeClassify = (invoice: Invoice, knowledgeBase: KnowledgeBase): HookResult => {
  if (!invoice.extractedData) {
    return buildResult([], [], {});
  }

  const history = lookupVendorHistory(invoice.extractedData.vendorName, knowledgeBase);
  return buildResult([], history.warnings, history.context);
};

const validateJournalLines = (entry: JournalEntry): string[] => {
  const errors: string[] = [];
  for (const line of [...entry.debitEntries, ...entry.creditEntries]) {
    if (!line.accountCode || !line.accountName) {
      errors.push("勘定科目コードまたは名称が未設定の仕訳行があります");
    }
    if (line.amount <= 0) {
      errors.push(`金額が0以下の仕訳行があります: ${line.accountName}`);
    }
  }
  return errors;
};

const validateBalance = (entry: JournalEntry): string[] => {
  const errors: string[] = [];
  if (entry.debitEntries.length === 0) {
    errors.push("借方が空です");
  }
  if (entry.creditEntries.length === 0) {
    errors.push("貸方が空です");
  }

  const debitTotal = entry.debitEntries.reduce((sum, de) => sum + de.amount, 0);
  const creditTotal = entry.creditEntries.reduce((sum, ce) => sum + ce.amount, 0);
  if (Math.abs(debitTotal - creditTotal) > ROUNDING_TOLERANCE) {
    errors.push(`貸借不一致: 借方合計=${debitTotal}, 貸方合計=${creditTotal}`);
  }
  return errors;
};

const afterClassify = (invoice: Invoice): HookResult => {
  const warnings: string[] = [];
  const entry = invoice.journalEntry;

  if (!entry) {
    return buildResult(["仕訳データが生成されていません"], warnings);
  }

  const errors = [...validateBalance(entry), ...validateJournalLines(entry)];

  if (entry.confidence < CONFIDENCE_THRESHOLD) {
    const pct = (entry.confidence * PERCENT_MULTIPLIER).toFixed(0);
    warnings.push(`AI信頼度が低い(${pct}%): 人間の確認を推奨`);
  }

  return buildResult(errors, warnings);
};

const beforeApprove = (invoice: Invoice): HookResult => {
  const errors: string[] = [];
  if (!invoice.extractedData) {
    errors.push("抽出データがありません");
  }
  if (!invoice.journalEntry) {
    errors.push("仕訳データがありません");
  }
  if (invoice.validationErrors.length > 0) {
    errors.push(`未解決のバリデーションエラーが${invoice.validationErrors.length}件あります`);
  }
  return buildResult(errors, []);
};

interface HookExtra {
  extracted?: ExtractedInvoiceData;
  knowledgeBase?: KnowledgeBase;
}

const HOOK_HANDLERS: Record<HookPhase, (invoice: Invoice, extra: HookExtra) => HookResult> = {
  afterClassify: (invoice) => afterClassify(invoice),
  afterExtract: (invoice, extra) => {
    if (!("extracted" in extra) || extra.extracted === null) {
      throw new Error("afterExtract requires extracted data");
    }
    return afterExtract(invoice, extra.extracted);
  },
  beforeApprove: (invoice) => beforeApprove(invoice),
  beforeClassify: (invoice, extra) => {
    if (!("knowledgeBase" in extra) || extra.knowledgeBase === null) {
      throw new Error("beforeClassify requires knowledgeBase");
    }
    return beforeClassify(invoice, extra.knowledgeBase);
  },
  beforeExtract: (invoice) => beforeExtract(invoice),
};

const runHook = (phase: HookPhase, invoice: Invoice, extra: HookExtra = {}): HookResult =>
  HOOK_HANDLERS[phase](invoice, extra);

export { runHook };
