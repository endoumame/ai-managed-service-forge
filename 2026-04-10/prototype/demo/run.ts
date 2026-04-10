/**
 * InvoiceGuard デモエントリポイント
 *
 * 全層（ハーネス・エージェント・決定論的コード・ナレッジ）を統合し、
 * 請求書処理の一連のフローをCLIで実証する。
 */

import type {
  AnomalyResult,
  ClassificationRule,
  HookResult,
  Invoice,
  JournalEntry,
} from "../types.ts";
import type { FeedbackRecord, KnowledgeData } from "../knowledge/store.ts";
import { createEmptyData, initializeRules, recordFeedback, serialize } from "../knowledge/store.ts";
import { evaluateChecklist, formatChecklist, isComplete } from "../harness/planner.ts";
import { sampleInvoices, sampleRules, sampleVendorHistory } from "../data/sample-invoices.ts";
import { classifyInvoice } from "../agent/index.ts";
import { resetJournalCounter } from "../deterministic/rules.ts";
import { runAnomalyChecks } from "../harness/checker.ts";
import { runHook } from "../harness/lifecycle.ts";

/** セクション区切り線の長さ */
const SEPARATOR_LENGTH = 60;

/** パーセント変換用の乗数 */
const PERCENT_MULTIPLIER = 100;

/** ToFixed の小数桁数（パーセント表示） */
const FIXED_DIGITS_PERCENT = 0;

/** ToFixed の小数桁数（スコア表示） */
const FIXED_DIGITS_SCORE = 2;

/** 金額比較の基準値 */
const AMOUNT_ZERO = 0;

/** 空コレクションの要素数 */
const EMPTY_LENGTH = 0;

const separator = "=".repeat(SEPARATOR_LENGTH);
const subSeparator = "-".repeat(SEPARATOR_LENGTH);

/** CLIデモアプリの標準出力ヘルパー */
const log = (message: string): void => {
  // oxlint-disable-next-line no-console -- CLIデモアプリのため標準出力が必要
  console.log(message);
};

/** セクションヘッダーを表示 */
const logSection = (title: string): void => {
  log(`\n${separator}`);
  log(`  ${title}`);
  log(separator);
};

/** フック結果を表示 */
const logHookResult = (result: HookResult): void => {
  const status = result.passed ? "PASS" : "FAIL";
  log(`  [${status}] ${result.phase}`);
  for (const err of result.errors) {
    log(`    ERROR: ${err}`);
  }
  for (const warn of result.warnings) {
    log(`    WARN: ${warn}`);
  }
};

/** 仕訳エントリを表示 */
const logJournalEntry = (entry: JournalEntry): void => {
  log(`  仕訳ID: ${entry.id}`);
  log(`  日付: ${entry.date}`);
  log(`  摘要: ${entry.description}`);
  log(`  確信度: ${(entry.confidence * PERCENT_MULTIPLIER).toFixed(FIXED_DIGITS_PERCENT)}%`);
  log(`  ステータス: ${entry.status}`);
  for (const line of entry.lines) {
    const debitStr = line.debit > AMOUNT_ZERO ? `借方 ${line.debit}円` : "";
    const creditStr = line.credit > AMOUNT_ZERO ? `貸方 ${line.credit}円` : "";
    log(`    ${line.accountName}(${line.accountCode}): ${debitStr}${creditStr}`);
  }
};

/** 異常検知結果を表示 */
const logAnomalyResult = (anomaly: AnomalyResult): void => {
  log(`  異常スコア: ${anomaly.overallScore.toFixed(FIXED_DIGITS_SCORE)}`);
  log(`  要レビュー: ${anomaly.needsHumanReview ? "YES" : "NO"}`);
  for (const check of anomaly.checks) {
    log(`    [${check.type}] スコア=${check.score.toFixed(FIXED_DIGITS_SCORE)} ${check.message}`);
  }
};

/** ヒューマン承認をシミュレーション（プロトタイプ用） */
const simulateHumanApproval = (invoice: Invoice, entry: JournalEntry): FeedbackRecord => {
  const isModified = invoice.id === "INV-002";
  const action = isModified ? "modified" : "approved";
  const [firstLine] = entry.lines;

  log(`\n  >> ヒューマン判断: ${action.toUpperCase()}`);
  if (isModified) {
    log("     修正: 支払手数料(6310) -> 業務委託費(6250)");
  }

  return {
    action,
    finalAccountCode: isModified ? "6250" : (firstLine?.accountCode ?? ""),
    finalAccountName: isModified ? "業務委託費" : (firstLine?.accountName ?? ""),
    invoiceId: invoice.id,
    originalAccountCode: firstLine?.accountCode ?? "",
    originalAccountName: firstLine?.accountName ?? "",
    timestamp: new Date().toISOString(),
    vendor: invoice.vendor,
  };
};

/** ハーネスフックを実行してログ出力 */
const runAndLogHooks = (invoice: Invoice): HookResult[] => {
  const beforeExtract = runHook("before-extract", { invoice });
  logHookResult(beforeExtract);

  const afterExtract = runHook("after-extract", { invoice });
  logHookResult(afterExtract);

  return [beforeExtract, afterExtract];
};

/** AI分類→フック→異常検知を実行 */
const classifyAndCheck = (
  invoice: Invoice,
  knowledgeRules: ClassificationRule[],
  pastInvoices: Invoice[],
): { entry: JournalEntry; anomaly: AnomalyResult; postHooks: HookResult[] } => {
  log("\n  [AI] 仕訳分類...");
  const entry = classifyInvoice(invoice, knowledgeRules);
  logJournalEntry(entry);

  const afterClassify = runHook("after-classify", { journalEntry: entry });
  logHookResult(afterClassify);

  log("\n  [異常検知]");
  const anomaly = runAnomalyChecks(invoice, pastInvoices, sampleVendorHistory);
  logAnomalyResult(anomaly);

  return { anomaly, entry, postHooks: [afterClassify] };
};

/** 1件の請求書を処理するパイプライン */
const processOneInvoice = (
  invoice: Invoice,
  knowledgeRules: ClassificationRule[],
  pastInvoices: Invoice[],
): { entry: JournalEntry; anomaly: AnomalyResult; hooks: HookResult[] } => {
  log(`\n${subSeparator}`);
  log(`  請求書: ${invoice.id} | ${invoice.vendor} | ${invoice.totalAmount}円`);
  log(subSeparator);

  const preHooks = runAndLogHooks(invoice);
  const { anomaly, entry, postHooks } = classifyAndCheck(invoice, knowledgeRules, pastInvoices);

  return { anomaly, entry, hooks: [...preHooks, ...postHooks] };
};

/** デモ状態を保持するコンテキスト */
interface DemoContext {
  knowledge: KnowledgeData;
  entries: JournalEntry[];
  anomalies: AnomalyResult[];
  processedInvoices: Invoice[];
}

/** 1件の請求書を処理してコンテキストに結果を追加 */
const processAndRecord = (ctx: DemoContext, invoice: Invoice): void => {
  const result = processOneInvoice(invoice, ctx.knowledge.rules, ctx.processedInvoices);

  const feedback = simulateHumanApproval(invoice, result.entry);
  result.entry.status = feedback.action === "approved" ? "approved" : "modified";

  const proposal = recordFeedback(ctx.knowledge, feedback);
  if (proposal) {
    log(`\n  [ナレッジ] 改善提案を生成: ${proposal.description}`);
  }

  ctx.entries.push(result.entry);
  ctx.anomalies.push(result.anomaly);
  ctx.processedInvoices.push(invoice);
};

/** Step 1: 全請求書を処理 */
const runInvoicePipeline = (ctx: DemoContext): void => {
  logSection("Step 1: 請求書処理パイプライン");
  for (const invoice of sampleInvoices) {
    processAndRecord(ctx, invoice);
  }
};

/** Step 2: 終了条件チェック */
const runCompletionCheck = (ctx: DemoContext): void => {
  logSection("Step 2: 終了条件チェック（ハーネスによる外部検証）");
  const checklist = evaluateChecklist(sampleInvoices, ctx.entries, ctx.anomalies);
  log(formatChecklist(checklist));
  log(`\n完了判定: ${isComplete(checklist) ? "ALL COMPLETE" : "INCOMPLETE"}`);
};

/** Step 3: ナレッジ改善提案の表示 */
const showImprovementProposals = (ctx: DemoContext): void => {
  logSection("Step 3: ナレッジ自動改善提案");
  const pendingProposals = ctx.knowledge.proposals.filter((prop) => prop.status === "pending");
  if (pendingProposals.length > EMPTY_LENGTH) {
    for (const prop of pendingProposals) {
      log(`\n  提案ID: ${prop.id}`);
      log(`  種別: ${prop.type}`);
      log(`  説明: ${prop.description}`);
      log(`  根拠: ${prop.evidence}`);
      log("  ステータス: 承認待ち（ヒューマン・イン・ザ・ループ）");
    }
  } else {
    log("  改善提案なし（すべてのAI提案が承認されました）");
  }
};

/** デモのまとめを表示 */
const showSummary = (ctx: DemoContext): void => {
  logSection("Step 4: ナレッジストアの現在状態");
  log(serialize(ctx.knowledge));

  logSection("デモ完了");
  log("このデモで実証したこと:");
  log("  1. ハーネスのライフサイクルフック（before/afterツールコール）");
  log("  2. 終了条件の外部管理（AIに自己申告させない）");
  log("  3. ナレッジの自動改善提案（承認/修正の蓄積からルール改善を提案）");
  log("  4. ヒューマン・イン・ザ・ループの接点（承認フロー）");
  log("  5. ドリフト対策（チェックリストによる完了検証）\n");
};

/** メイン処理 */
const main = (): void => {
  logSection("InvoiceGuard - 請求書自動仕訳・異常検知 デモ");
  log("AIマネージドサービスのプロトタイプ: ハーネス + エージェント + 決定論的コード");

  resetJournalCounter();
  const ctx: DemoContext = {
    anomalies: [],
    entries: [],
    knowledge: createEmptyData(),
    processedInvoices: [],
  };
  initializeRules(ctx.knowledge, [...sampleRules]);

  runInvoicePipeline(ctx);
  runCompletionCheck(ctx);
  showImprovementProposals(ctx);
  showSummary(ctx);
};

main();
