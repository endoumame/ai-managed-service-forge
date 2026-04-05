/**
 * Demo/run.ts — デモ実行エントリポイント
 *
 * InvoiceForgeの3層アーキテクチャが連携して動作することを示すデモ。
 */

import { INITIAL_MAPPINGS, SAMPLE_INVOICES } from "./data.ts";
import { checkExtraction, checkJournalEntry } from "../harness/checker.ts";
import { generateJournalEntry, validateTaxAmount } from "../deterministic/rules.ts";
import { registerHook, runHooks } from "../harness/lifecycle.ts";
import { CompletionPlanner } from "../harness/planner.ts";
import type { ExtractedInvoice } from "../types.ts";
import { KnowledgeStore } from "../knowledge/store.ts";
import type { QualityCheckResult } from "../harness/checker.ts";
import { detectImprovement } from "../knowledge/improver.ts";

const ONE = 1;
const SEPARATOR_LEN = 60;
const HALF = 2;
const SEPARATOR = "=".repeat(SEPARATOR_LEN);
const SUB_SEPARATOR = "-".repeat(SEPARATOR_LEN / HALF);
const DEMO_VENDOR = "株式会社デザインラボ";
const DEMO_AMOUNT = 250_000;

/* eslint-disable no-console -- デモ用CLIツール */
const log = (message: string): void => {
  console.log(message);
};
const section = (title: string): void => {
  log(`\n${SEPARATOR}\n  ${title}\n${SEPARATOR}`);
};
const subSection = (title: string): void => {
  log(`\n${SUB_SEPARATOR}\n  ${title}\n${SUB_SEPARATOR}`);
};

/** チェック結果を表示 */
const logCheckResult = (label: string, result: QualityCheckResult): void => {
  log(`  ${label}: ${result.passed ? "PASS" : "FAIL"}`);
  for (const issue of result.issues) {
    log(`    [${issue.severity.toUpperCase()}] ${issue.message}`);
  }
};

/** 仕訳行を表示 */
const logJournalLines = (journal: ReturnType<typeof generateJournalEntry>): void => {
  log(`  仕訳日: ${journal.entryDate}`);
  for (const line of journal.lines) {
    const debit =
      typeof line.debitAmount === "number" ? `借方 ¥${line.debitAmount.toLocaleString()}` : "";
    const credit =
      typeof line.creditAmount === "number" ? `貸方 ¥${line.creditAmount.toLocaleString()}` : "";
    log(`    ${line.accountCode} ${line.accountName}: ${debit}${credit}`);
  }
};

/** ハーネスのライフサイクルフックを登録 */
const setupHarness = (): void => {
  registerHook("after-extract", () => ({ errors: [], passed: true, warnings: [] }));
  registerHook("after-journalize", () => ({ errors: [], passed: true, warnings: [] }));
  log("ライフサイクルフック登録完了: after-extract, after-journalize");
};

/** 抽出 + バリデーションフェーズ */
const phaseExtract = (invoice: ExtractedInvoice, planner: CompletionPlanner): void => {
  subSection("AIエージェントによるデータ抽出");
  log(
    `  取引先: ${invoice.vendorName} | 請求番号: ${invoice.invoiceNumber} | ¥${invoice.totalAmount.toLocaleString()}`,
  );
  subSection("ハーネスによる抽出結果バリデーション");
  runHooks("after-extract", invoice);
  logCheckResult("検証結果", checkExtraction(invoice));
  planner.markComplete("extraction");
};

/** 税検証フェーズ */
const phaseTaxValidation = (invoice: ExtractedInvoice, planner: CompletionPlanner): void => {
  subSection("決定論的コードによる税計算検証");
  const tax = validateTaxAmount(invoice);
  log(`  税計算: 期待値=${tax.expected} 実績値=${tax.actual} → ${tax.valid ? "OK" : "NG"}`);
  planner.markComplete("tax-validation");
};

/** 仕訳生成フェーズ */
const phaseJournalize = (
  invoice: ExtractedInvoice,
  store: KnowledgeStore,
  planner: CompletionPlanner,
): void => {
  subSection("決定論的コードによる仕訳生成 + バリデーション");
  const journal = generateJournalEntry(invoice, store.getMappings());
  logJournalLines(journal);
  runHooks("after-journalize", journal);
  logCheckResult("仕訳検証", checkJournalEntry(journal));
  planner.markComplete("journalize");
  store.recordUsage(invoice.vendorName);
};

/** ナレッジ改善提案デモ */
const demonstrateImprovement = (store: KnowledgeStore): void => {
  log("シナリオ: 「株式会社デザインラボ」の仕訳を人間が修正した");
  const base = { description: DEMO_VENDOR, entryDate: "2026-04-05", invoiceRef: "DL-2026-042" };
  const proposal = detectImprovement({
    correctedEntry: {
      ...base,
      lines: [{ accountCode: "5600", accountName: "広告宣伝費", debitAmount: DEMO_AMOUNT }],
    },
    originalEntry: {
      ...base,
      lines: [{ accountCode: "5900", accountName: "雑費", debitAmount: DEMO_AMOUNT }],
    },
    store,
    vendorName: DEMO_VENDOR,
  });
  if (typeof proposal !== "object" || proposal === null) {
    return;
  }
  log(`  改善提案: ${proposal.description}`);
  subSection("ヒューマン・イン・ザ・ループ: 承認フロー");
  store.addProposal(proposal);
  log(`  承認結果: ${store.approveProposal(proposal.id) ? "SUCCESS" : "FAILED"}`);
};

/** Plannerを初期化 */
const createPlanner = (): CompletionPlanner => {
  const planner = new CompletionPlanner();
  planner.addItem("extraction", "全必須フィールド抽出完了");
  planner.addItem("tax-validation", "税計算検証完了");
  planner.addItem("journalize", "仕訳生成・バリデーション完了");
  return planner;
};

/** 全請求書を処理 */
const processAllInvoices = (store: KnowledgeStore, planner: CompletionPlanner): void => {
  for (const [idx, invoice] of SAMPLE_INVOICES.entries()) {
    log(`\n>>> 請求書 ${idx + ONE}/${SAMPLE_INVOICES.length} <<<`);
    phaseExtract(invoice, planner);
    phaseTaxValidation(invoice, planner);
    phaseJournalize(invoice, store, planner);
  }
};

/** パイプライン実行 */
const runPipeline = (store: KnowledgeStore): CompletionPlanner => {
  section("Step 1: ハーネス初期化");
  setupHarness();
  log(`ナレッジベース: ${INITIAL_MAPPINGS.length}件のマッピング`);
  section("Step 2: 請求書処理パイプライン");
  const planner = createPlanner();
  processAllInvoices(store, planner);
  return planner;
};

/** メイン */
const main = (): void => {
  section("InvoiceForge プロトタイプデモ");
  const store = KnowledgeStore.fromMappings(INITIAL_MAPPINGS);
  const planner = runPipeline(store);
  section("終了条件チェック（ドリフト対策）");
  log(planner.getReport());
  section("Step 3: ナレッジ改善ループ");
  demonstrateImprovement(store);
  section("デモ完了");
};

main();
