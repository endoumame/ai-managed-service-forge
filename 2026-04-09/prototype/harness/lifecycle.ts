/**
 * ハーネス層: ライフサイクルフック管理
 *
 * AIエージェントの出力を「信頼せずに検証する」のがハーネスの本質的役割。
 * 各フェーズ（before/after）でフックを実行し、品質基準を満たさない場合は
 * パイプラインを停止する。これにより、AIのドリフト（品質の自己過信、
 * 終了条件の誤認）を構造的に防止する。
 */

import type {
  AccountClassification,
  ExtractedInvoice,
  HookPhase,
  HookResult,
  JournalEntry,
  RawInvoiceInput,
} from "../types.ts";

/** 金額比較の許容誤差 */
const AMOUNT_TOLERANCE = 1;

/** Reduce の初期値 */
const SUM_INITIAL = 0;

/** 信頼度の警告閾値 */
const LOW_CONFIDENCE_THRESHOLD = 0.7;

/** 勘定科目の危険閾値 */
const VERY_LOW_CONFIDENCE_THRESHOLD = 0.5;

/** 信頼度をパーセント表示に変換する倍率 */
const PERCENT_MULTIPLIER = 100;

/** フェーズごとの入力型マッピング（型安全なフック実行のため） */
interface HookPhaseMap {
  beforeExtract: RawInvoiceInput;
  afterExtract: ExtractedInvoice;
  afterClassify: AccountClassification;
  afterJournalEntry: JournalEntry;
}

type TypedHookHandler<Phase extends HookPhase> = (data: HookPhaseMap[Phase]) => HookResult;

/** フェーズごとの型付きフックハンドラを登録・実行するレジストリ */
class LifecycleManager {
  private hooks = new Map<HookPhase, TypedHookHandler<HookPhase>[]>();

  register<Phase extends HookPhase>(phase: Phase, handler: TypedHookHandler<Phase>): void {
    const existing = this.hooks.get(phase) ?? [];
    // oxlint-disable-next-line no-unsafe-type-assertion -- Phase → HookPhase widening for heterogeneous storage
    existing.push(handler as TypedHookHandler<HookPhase>);
    this.hooks.set(phase, existing);
  }

  execute<Phase extends HookPhase>(phase: Phase, data: HookPhaseMap[Phase]): HookResult {
    const handlers = this.hooks.get(phase) ?? [];
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const handler of handlers) {
      const result = handler(data);
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    }

    return { errors, passed: errors.length === SUM_INITIAL, phase, warnings };
  }
}

/** BeforeExtract: 入力データの形式を検証 */
const validateInput: TypedHookHandler<"beforeExtract"> = (input) => {
  const errors: string[] = [];

  if (input.sourceId.length === SUM_INITIAL) {
    errors.push("sourceIdが未指定です");
  }
  if (typeof input.text !== "string" && typeof input.structured !== "object") {
    errors.push("textまたはstructuredのいずれかが必要です");
  }

  return { errors, passed: errors.length === SUM_INITIAL, phase: "beforeExtract", warnings: [] };
};

/** 必須項目の存在チェック */
const collectExtractionErrors = (invoice: ExtractedInvoice): string[] => {
  const errors: string[] = [];
  if (invoice.vendorName.length === SUM_INITIAL) {
    errors.push("取引先名が未抽出です");
  }
  if (invoice.invoiceNumber.length === SUM_INITIAL) {
    errors.push("請求書番号が未抽出です");
  }
  if (invoice.invoiceDate.length === SUM_INITIAL) {
    errors.push("日付が未抽出です");
  }
  if (invoice.lineItems.length === SUM_INITIAL) {
    errors.push("明細行が未抽出です");
  }
  return errors;
};

/** 金額整合性チェック（決定論的検証: AIに任せない） */
const checkAmountIntegrity = (invoice: ExtractedInvoice): string[] => {
  if (invoice.lineItems.length === SUM_INITIAL) {
    return [];
  }
  const lineTotal = invoice.lineItems.reduce((sum, item) => sum + item.amount, SUM_INITIAL);
  const expectedTotal = lineTotal + invoice.taxAmount;
  if (Math.abs(expectedTotal - invoice.totalAmount) >= AMOUNT_TOLERANCE) {
    return [
      `金額整合性エラー: 明細合計(${lineTotal}) + 税額(${invoice.taxAmount}) = ${expectedTotal} ≠ 合計金額(${invoice.totalAmount})`,
    ];
  }
  return [];
};

/** AfterExtract: AI抽出結果の必須項目・金額整合性を検証 */
const validateExtraction: TypedHookHandler<"afterExtract"> = (invoice) => {
  const errors = [...collectExtractionErrors(invoice), ...checkAmountIntegrity(invoice)];
  const warnings: string[] = [];

  if (invoice.confidence < LOW_CONFIDENCE_THRESHOLD) {
    warnings.push(
      `AI抽出の信頼度が低い: ${(invoice.confidence * PERCENT_MULTIPLIER).toFixed(SUM_INITIAL)}%`,
    );
  }

  return { errors, passed: errors.length === SUM_INITIAL, phase: "afterExtract", warnings };
};

/** AfterClassify: 勘定科目推定の信頼度を検証 */
const validateClassification: TypedHookHandler<"afterClassify"> = (classification) => {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (classification.accountCode.length === SUM_INITIAL) {
    errors.push("勘定科目コードが未設定です");
  }
  if (classification.confidence < VERY_LOW_CONFIDENCE_THRESHOLD) {
    warnings.push(
      `勘定科目の推定信頼度が非常に低い: ${(classification.confidence * PERCENT_MULTIPLIER).toFixed(SUM_INITIAL)}% -- ヒューマンレビューを推奨`,
    );
  }

  return { errors, passed: errors.length === SUM_INITIAL, phase: "afterClassify", warnings };
};

/** 仕訳エントリのエラーを収集する */
const collectJournalErrors = (entry: JournalEntry): string[] => {
  const errors: string[] = [];
  if (Math.abs(entry.debitAmount - entry.creditAmount) >= AMOUNT_TOLERANCE) {
    errors.push(`仕訳不整合: 借方(${entry.debitAmount}) ≠ 貸方(${entry.creditAmount})`);
  }
  if (entry.date.length === SUM_INITIAL) {
    errors.push("仕訳日付が未設定です");
  }
  if (entry.debitAccount.length === SUM_INITIAL) {
    errors.push("借方勘定が未設定です");
  }
  if (entry.creditAccount.length === SUM_INITIAL) {
    errors.push("貸方勘定が未設定です");
  }
  return errors;
};

/** AfterJournalEntry: 仕訳の借方・貸方一致を検証 */
const validateJournalEntry: TypedHookHandler<"afterJournalEntry"> = (data) => {
  const errors = collectJournalErrors(data);
  return {
    errors,
    passed: errors.length === SUM_INITIAL,
    phase: "afterJournalEntry",
    warnings: [],
  };
};

/** デフォルトのライフサイクルフックを登録したマネージャーを生成する */
const createDefaultLifecycleManager = (): LifecycleManager => {
  const manager = new LifecycleManager();
  manager.register("beforeExtract", validateInput);
  manager.register("afterExtract", validateExtraction);
  manager.register("afterClassify", validateClassification);
  manager.register("afterJournalEntry", validateJournalEntry);
  return manager;
};

export { createDefaultLifecycleManager, LifecycleManager };
