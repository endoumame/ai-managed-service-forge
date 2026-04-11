/**
 * InvoiceForge デモランナー
 *
 * 請求書処理の一連のフローをデモンストレーションする:
 * 1. サンプル請求書の読み込み
 * 2. ハーネスによる入力バリデーション（beforeExtract）
 * 3. AIエージェントによる情報抽出
 * 4. ハーネスによる金額検算（afterExtract）
 * 5. 決定論的ルールエンジンによる仕訳分類
 * 6. ハーネスによる乖離チェック（afterClassify）
 * 7. 終了条件チェックリスト評価
 * 8. ナレッジ改善提案の生成
 */

import type { CorrectionRecord, HookResult, JournalEntry, RawInvoice } from "../types.ts";

import {
  afterClassify,
  afterExtract,
  beforeExtract,
  beforeFinalize,
} from "../harness/lifecycle.ts";
import { classifyInvoice, getDefaultRules } from "../deterministic/rules.ts";
import { evaluateChecklist, formatChecklist, isComplete } from "../harness/planner.ts";
import { analyzeCorrections } from "../knowledge/improver.ts";
import { createEmptyKnowledge } from "../knowledge/store.ts";
import { extractInvoice } from "../agent/index.ts";

import sampleInvoices from "./sample-invoices.json";

const SEPARATOR_WIDTH = 60;
const THIN_SEPARATOR_WIDTH = 40;
const SEPARATOR = "=".repeat(SEPARATOR_WIDTH);
const THIN_SEPARATOR = "-".repeat(THIN_SEPARATOR_WIDTH);
const MOCK_CONFIDENCE = 0.95;
const INITIAL_SUM = 0;

declare const process: {
  stdout: { write: (str: string) => boolean };
  stderr: { write: (str: string) => boolean };
  exit: (code: number) => never;
};

const log = (msg: string): void => {
  process.stdout.write(`${msg}\n`);
};

const logSection = (title: string): void => {
  log("");
  log(SEPARATOR);
  log(`  ${title}`);
  log(SEPARATOR);
};

const logHookResult = (name: string, result: HookResult): void => {
  log(`[Hook: ${name}] ${result.passed ? "PASS" : "FAIL"}`);
  for (const msg of result.messages) {
    log(`  ${msg}`);
  }
  for (const warn of result.warnings) {
    log(`  ⚠ ${warn}`);
  }
};

const validateAndExtract = (invoice: RawInvoice): ReturnType<typeof extractInvoice> | null => {
  log(`\n${THIN_SEPARATOR}`);
  log(`請求書: ${invoice.id} (${invoice.vendorName})`);
  const preCheck = beforeExtract(invoice);
  logHookResult("beforeExtract", preCheck);
  if (!preCheck.passed) {
    return null;
  }
  const extracted = extractInvoice(invoice);
  log(`[Agent] 抽出完了 (信頼度: ${extracted.confidence})`);
  logHookResult("afterExtract", afterExtract(extracted));
  return extracted;
};

const processInvoice = (
  invoice: RawInvoice,
  rules: ReturnType<typeof getDefaultRules>,
  historicalEntries: JournalEntry[],
): JournalEntry | null => {
  const extracted = validateAndExtract(invoice);
  if (!extracted) {
    return null;
  }
  const entry = classifyInvoice(extracted, rules);
  log(`[Rules] 仕訳生成完了 (ステータス: ${entry.status})`);
  logHookResult("afterClassify", afterClassify(entry, historicalEntries));
  return entry;
};

const simulateHumanReview = (entries: JournalEntry[]): JournalEntry[] =>
  entries.map((entry) => {
    if (entry.status === "flagged") {
      log(`  [Human] 仕訳 ${entry.invoiceId} を承認しました`);
      return { ...entry, status: "approved" as const };
    }
    if (entry.status === "validated") {
      return { ...entry, status: "approved" as const };
    }
    return entry;
  });

const simulateCorrections = (): CorrectionRecord[] => [
  {
    category: "未分類",
    correctedAccountCode: "6400",
    correctedAccountName: "加工費",
    correctedAt: "2026-03-01",
    invoiceId: "INV-2026-OLD-001",
    originalAccountCode: "6999",
    vendorId: "unknown",
  },
  {
    category: "未分類",
    correctedAccountCode: "6400",
    correctedAccountName: "加工費",
    correctedAt: "2026-03-15",
    invoiceId: "INV-2026-OLD-002",
    originalAccountCode: "6999",
    vendorId: "unknown",
  },
  {
    category: "未分類",
    correctedAccountCode: "6400",
    correctedAccountName: "加工費",
    correctedAt: "2026-04-01",
    invoiceId: "INV-2026-OLD-003",
    originalAccountCode: "6999",
    vendorId: "unknown",
  },
];

const runPipeline = (invoices: RawInvoice[]): JournalEntry[] => {
  logSection("Step 1: 請求書処理パイプライン");
  const rules = getDefaultRules();
  return invoices
    .map((invoice) => processInvoice(invoice, rules, []))
    .filter((entry): entry is JournalEntry => entry !== null);
};

const runChecklistReport = (invoices: RawInvoice[], results: JournalEntry[]): void => {
  logSection("Step 2: 終了条件チェック（人間確認前）");
  const extracted = invoices.map((inv) => ({
    anomalies: [] as string[],
    confidence: MOCK_CONFIDENCE,
    dueDate: inv.dueDate,
    invoiceDate: inv.invoiceDate,
    invoiceId: inv.id,
    lineItems: [] as never[],
    subtotal: inv.subtotal,
    taxAmount: inv.taxAmount,
    totalAmount: inv.totalAmount,
    vendorId: null,
    vendorName: inv.vendorName,
  }));
  const checklist = evaluateChecklist(invoices.length, extracted, results);
  log(formatChecklist(checklist));
  log(`完了判定: ${isComplete(checklist) ? "完了" : "未完了"}`);
};

const logProposal = (proposal: ReturnType<typeof analyzeCorrections>[number]): void => {
  log(`\n  [提案] ${proposal.description}`);
  log(`  タイプ: ${proposal.type}`);
  log(`  根拠: ${proposal.evidence.length}件の修正履歴`);
  log(`  ステータス: ${proposal.status} (人間の承認待ち)`);
};

const runKnowledgeImprovement = (): void => {
  logSection("Step 5: ナレッジ改善提案");
  const corrections = simulateCorrections();
  const knowledge = createEmptyKnowledge();
  log(`蓄積された修正履歴: ${corrections.length}件`);
  log(`現在のナレッジルール数: ${knowledge.rules.length}件`);
  const proposals = analyzeCorrections(corrections);
  for (const proposal of proposals) {
    logProposal(proposal);
  }
};

const printSummary = (reviewed: JournalEntry[]): void => {
  logSection("Step 6: 仕訳結果サマリ");
  for (const entry of reviewed) {
    const totalDebit = entry.entries.reduce((sum, line) => sum + line.debit, INITIAL_SUM);
    log(`  ${entry.invoiceId}: ${entry.vendorName} | ${totalDebit}円 | ${entry.status}`);
  }
  logSection("デモ完了");
  log("このプロトタイプで実証したこと:");
  log("  1. ハーネスによる決定論的品質チェック（AIの自己過信を防止）");
  log("  2. 終了条件の外部管理（AIの途中完了宣言を防止）");
  log("  3. ナレッジ自動改善ループ（使うほど賢くなるサービス）");
  log("  4. ヒューマン・イン・ザ・ループ（人間の承認なしに完了しない）");
};

const runReviewAndValidation = (results: JournalEntry[]): JournalEntry[] => {
  logSection("Step 3: ヒューマン・イン・ザ・ループ（承認シミュレーション）");
  const reviewed = simulateHumanReview(results);
  logSection("Step 4: 最終バリデーション");
  logHookResult("beforeFinalize", beforeFinalize(reviewed));
  return reviewed;
};

const main = (): void => {
  logSection("InvoiceForge プロトタイプデモ");
  log("AIマネージドサービスによる請求書自動仕訳デモ");

  const invoices = sampleInvoices as RawInvoice[];
  const results = runPipeline(invoices);
  runChecklistReport(invoices, results);

  const reviewed = runReviewAndValidation(results);
  runKnowledgeImprovement();
  printSummary(reviewed);
};

main();
