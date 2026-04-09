/**
 * ハーネス層: パイプライン実行プランナー
 *
 * 処理パイプライン全体を統括し、各フェーズの実行順序と
 * フック呼び出しを管理する。AIエージェントは「呼ばれる側」であり、
 * 主導権はハーネスが持つ。これがハーネスアーキテクチャの核心。
 */

import type {
  AccountClassification,
  ExtractedInvoice,
  HookResult,
  HumanReviewRequest,
  JournalEntry,
  KnowledgeEntry,
  ProcessingResult,
  RawInvoiceInput,
} from "../types.ts";
import { buildCompletionChecklist, checkDuplicateInvoice } from "./checker.ts";
import type { LifecycleManager } from "./lifecycle.ts";
import { log } from "../logger.ts";

/** ヒューマンレビュー閾値: これ未満で確認を求める */
const REVIEW_CONFIDENCE_THRESHOLD = 0.8;

/** 信頼度をパーセントに変換する倍率 */
const PERCENT_MULTIPLIER = 100;

/** 小数点以下の桁数（整数表示） */
const NO_DECIMAL_PLACES = 0;

/** AIエージェント層のインターフェース */
interface AgentInterface {
  extract(input: RawInvoiceInput): Promise<ExtractedInvoice>;
  classify(invoice: ExtractedInvoice, knowledge: KnowledgeEntry): Promise<AccountClassification>;
}

/** 決定論的コード層のインターフェース */
interface DeterministicInterface {
  generateJournalEntry(
    invoice: ExtractedInvoice,
    classification: AccountClassification,
  ): JournalEntry;
}

/** ヒューマンレビューハンドラのインターフェース */
interface HumanReviewHandler {
  requestReview(request: HumanReviewRequest): Promise<string>;
}

/** パイプライン実行中の中間状態 */
interface PipelineContext {
  humanReviewsRequested: HumanReviewRequest[];
  knowledgeUpdates: string[];
}

/** PipelinePlanner のコンストラクタ引数 */
interface PlannerDeps {
  lifecycle: LifecycleManager;
  agent: AgentInterface;
  deterministic: DeterministicInterface;
  humanReview: HumanReviewHandler;
  knowledge: KnowledgeEntry;
}

interface DuplicateCheckArgs {
  extracted: ExtractedInvoice;
  knowledge: KnowledgeEntry;
  ctx: PipelineContext;
  humanReview: HumanReviewHandler;
}

interface ClassificationReviewArgs {
  classification: AccountClassification;
  extracted: ExtractedInvoice;
  ctx: PipelineContext;
  humanReview: HumanReviewHandler;
}

/** フック結果をログ出力する */
const logHookResult = (result: HookResult): void => {
  const statusIcon = result.passed ? "[OK]" : "[NG]";
  log(`[Harness] ${statusIcon} ${result.phase}`);
  for (const error of result.errors) {
    log(`  ERROR: ${error}`);
  }
  for (const warning of result.warnings) {
    log(`  WARN: ${warning}`);
  }
};

/** フックを実行し、失敗時はエラーをスローする */
const executeRequiredHook = (
  lifecycle: LifecycleManager,
  phase: HookResult["phase"],
  data: unknown,
): void => {
  const result = lifecycle.execute(phase, data);
  logHookResult(result);
  if (!result.passed) {
    throw new Error(`${phase}失敗: ${result.errors.join(", ")}`);
  }
};

/** 重複チェック + ヒューマンレビュー */
const handleDuplicateCheck = async ({
  extracted,
  knowledge,
  ctx,
  humanReview,
}: DuplicateCheckArgs): Promise<void> => {
  const duplicateCheck = checkDuplicateInvoice({
    invoiceNumber: extracted.invoiceNumber,
    knowledge,
    totalAmount: extracted.totalAmount,
    vendorName: extracted.vendorName,
  });

  if (!duplicateCheck.isDuplicate) {
    return;
  }

  log(`[Harness] 重複請求書を検知: ${duplicateCheck.matchedRecord?.processedAt}に処理済み`);
  const reviewRequest: HumanReviewRequest = {
    defaultValue: "スキップ",
    message: `重複の可能性: 請求書${extracted.invoiceNumber}は既に処理済みです。続行しますか？`,
    options: ["続行", "スキップ"],
    type: "amount_anomaly",
  };
  ctx.humanReviewsRequested.push(reviewRequest);
  const response = await humanReview.requestReview(reviewRequest);
  if (response === "スキップ") {
    throw new Error("重複請求書のためスキップされました");
  }
};

/** 低信頼度の場合にヒューマンレビューを実施し、必要に応じて分類を更新する */
const handleClassificationReview = async ({
  classification,
  extracted,
  ctx,
  humanReview,
}: ClassificationReviewArgs): Promise<AccountClassification> => {
  if (classification.confidence >= REVIEW_CONFIDENCE_THRESHOLD) {
    return classification;
  }

  const confidencePercent = (classification.confidence * PERCENT_MULTIPLIER).toFixed(
    NO_DECIMAL_PLACES,
  );
  const reviewRequest: HumanReviewRequest = {
    currentValue: classification.accountName,
    defaultValue: classification.accountName,
    message: `勘定科目の推定信頼度が${confidencePercent}%です。推定: ${classification.accountName}(${classification.accountCode})。正しいですか？`,
    options: [classification.accountName, "仕入高", "消耗品費", "通信費", "支払手数料", "その他"],
    type: "account_confirmation",
  };
  ctx.humanReviewsRequested.push(reviewRequest);
  const response = await humanReview.requestReview(reviewRequest);

  if (response === classification.accountName) {
    return classification;
  }

  ctx.knowledgeUpdates.push(
    `取引先「${extracted.vendorName}」の勘定科目を「${response}」として学習`,
  );
  return {
    ...classification,
    accountName: response,
    confidence: 1,
    reasoning: `ユーザーにより「${response}」に確定`,
  };
};

/** チェックリスト結果をコンソールに出力する */
const logChecklist = (checklist: ProcessingResult["checklist"]): void => {
  log("\n[Harness] 終了条件チェックリスト:");
  for (const item of checklist.items) {
    log(`  ${item.passed ? "[OK]" : "[NG]"} ${item.label}: ${item.detail}`);
  }
  if (!checklist.allPassed) {
    log(`\n[Harness] 未達成項目あり: ${checklist.failureSummary}`);
  }
};

/** 入力検証 → AI抽出 → 抽出結果検証 を一括実行 */
const extractPhase = async (
  input: RawInvoiceInput,
  deps: Pick<PlannerDeps, "lifecycle" | "agent">,
): Promise<ExtractedInvoice> => {
  executeRequiredHook(deps.lifecycle, "beforeExtract", input);
  log("\n[Agent] 請求書データを抽出中...");
  const extracted = await deps.agent.extract(input);
  executeRequiredHook(deps.lifecycle, "afterExtract", extracted);
  return extracted;
};

/** 勘定科目推定 → フック → ヒューマンレビュー を一括実行 */
const classifyPhase = async (
  extracted: ExtractedInvoice,
  deps: Pick<PlannerDeps, "lifecycle" | "agent" | "humanReview" | "knowledge">,
  ctx: PipelineContext,
): Promise<AccountClassification> => {
  log("[Agent] 勘定科目を推定中...");
  const raw = await deps.agent.classify(extracted, deps.knowledge);
  logHookResult(deps.lifecycle.execute("afterClassify", raw));
  return handleClassificationReview({
    classification: raw,
    ctx,
    extracted,
    humanReview: deps.humanReview,
  });
};

/** 仕訳生成 → 検証 → チェックリスト を一括実行 */
const journalPhase = (
  extracted: ExtractedInvoice,
  classification: AccountClassification,
  deps: Pick<PlannerDeps, "lifecycle" | "deterministic">,
): { journalEntry: JournalEntry; checklist: ProcessingResult["checklist"] } => {
  log("[Deterministic] 仕訳データを生成中...");
  const journalEntry = deps.deterministic.generateJournalEntry(extracted, classification);
  executeRequiredHook(deps.lifecycle, "afterJournalEntry", journalEntry);
  const checklist = buildCompletionChecklist(extracted, classification, journalEntry);
  logChecklist(checklist);
  return { checklist, journalEntry };
};

/**
 * パイプライン実行プランナー
 *
 * 実行フロー:
 * 1. beforeExtract → 2. AI抽出 → 3. afterExtract → 4. 重複チェック
 * 5. AI分類 → 6. afterClassify → 7. ヒューマンレビュー
 * 8. 仕訳生成 → 9. afterJournalEntry → 10. 終了条件チェック
 */
class PipelinePlanner {
  private deps: PlannerDeps;

  constructor(deps: PlannerDeps) {
    this.deps = deps;
  }

  async process(input: RawInvoiceInput): Promise<ProcessingResult> {
    const ctx: PipelineContext = { humanReviewsRequested: [], knowledgeUpdates: [] };
    const extracted = await extractPhase(input, this.deps);
    await handleDuplicateCheck({
      ctx,
      extracted,
      humanReview: this.deps.humanReview,
      knowledge: this.deps.knowledge,
    });
    const classification = await classifyPhase(extracted, this.deps, ctx);
    const { journalEntry, checklist } = journalPhase(extracted, classification, this.deps);

    return {
      checklist,
      classification,
      extracted,
      humanReviewsRequested: ctx.humanReviewsRequested,
      journalEntry,
      knowledgeUpdates: ctx.knowledgeUpdates,
      sourceId: input.sourceId,
    };
  }
}

export { PipelinePlanner };
export type { AgentInterface, DeterministicInterface, HumanReviewHandler, PlannerDeps };
