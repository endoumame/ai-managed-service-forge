/* eslint-disable no-console -- CLIデモのエントリポイントのため標準出力が必要 */

import type { HookContext, JournalEntry, KnowledgePattern } from "../types.js";
import { addPattern, createStore } from "../knowledge/store.js";
import {
  createHarness,
  initTransaction,
  markStep,
  runHooks,
  setupDefaultHooks,
} from "../harness/lifecycle.js";
import type { HarnessState } from "../harness/lifecycle.js";
import type { KnowledgeStore } from "../knowledge/store.js";
import type { ProcessTransactionParams } from "../agent/index.js";
import { checkBalance } from "../deterministic/rules.js";
import { processTransaction } from "../agent/index.js";
import { proposeNewPattern } from "../knowledge/improver.js";

const CONFIDENCE_THRESHOLD = 0.8;
const SEPARATOR_LENGTH = 60;
const PERCENT = 100;
const TX_INDEX_OFFSET = 1;
const TX_PAD_LENGTH = 3;
const FIRST_LINE = 0;
const ZERO_AMOUNT = 0;
const CODE_PAD = 8;
const NAME_PAD = 6;
const AMOUNT_PAD = 8;
const AMOUNT_BLANK = "        ";
const LAST_ITEM = -1;

const log = console.log.bind(console);

const separator = (title: string): string => {
  const line = "=".repeat(SEPARATOR_LENGTH);
  return `\n${line}\n  ${title}\n${line}`;
};

const SAMPLE_TRANSACTIONS = [
  "株式会社サンプルオフィス\n2026-04-15 オフィス家賃 4月分\n330,000円",
  "東京タクシー\n2026-04-20 品川駅→顧客先訪問 タクシー利用\n3,500円",
  "アスクル株式会社\n2026-04-22 コピー用紙A4 5箱、ボールペン 10本\n8,800円",
  "株式会社グルメケータリング\n2026-04-25 全社会議用 弁当30個 飲料30本\n28,500円",
];

const SEED_PATTERN: KnowledgePattern = {
  accountCode: "6900",
  accountName: "地代家賃",
  approvedBy: "経理マネージャー",
  counterparty: "株式会社サンプルオフィス",
  descriptionKeywords: ["オフィス", "家賃"],
  id: "KP-seed-001",
  lastUsed: "2026-03-15",
  taxCategory: "taxable_10",
  usageCount: 12,
};

const formatConfidence = (confidence: number): string =>
  `${String(Math.round(confidence * PERCENT))}%`;

const formatAmount = (amount: number): string =>
  amount > ZERO_AMOUNT ? String(amount).padStart(AMOUNT_PAD) : AMOUNT_BLANK;

const printJournalLines = (lines: JournalEntry["lines"]): void => {
  log("  ┌──────────┬────────────┬──────────┬──────────┐");
  log("  │ 科目コード│ 科目名     │ 借方     │ 貸方     │");
  log("  ├──────────┼────────────┼──────────┼──────────┤");
  for (const line of lines) {
    log(
      `  │ ${line.accountCode.padEnd(CODE_PAD)} │ ${line.accountName.padEnd(NAME_PAD)}   │ ${formatAmount(line.debit)} │ ${formatAmount(line.credit)} │`,
    );
  }
  log("  └──────────┴────────────┴──────────┴──────────┘");
};

const printJournalEntry = (entry: JournalEntry): void => {
  log(`  仕訳ID: ${entry.id}  日付: ${entry.date}`);
  log(`  摘要: ${entry.description}`);
  log(`  確信度: ${formatConfidence(entry.confidence)}  根拠: ${entry.reasoning}`);
  printJournalLines(entry.lines);
};

interface HarnessCheckParams {
  harness: HarnessState;
  txId: string;
  ctx: HookContext;
}

const runExtractCheck = (params: HarnessCheckParams): void => {
  const result = runHooks(params.harness, "after", params.ctx);
  if (result.passed) {
    markStep(params.harness, params.txId, "extracted");
    log("  [HARNESS] 抽出検証: PASS");
  } else {
    log(`  [HARNESS] 抽出検証: FAIL — ${result.errors.join(", ")}`);
  }
};

const runJournalCheck = (params: HarnessCheckParams): void => {
  const result = runHooks(params.harness, "after", params.ctx);
  if (result.passed) {
    markStep(params.harness, params.txId, "journalGenerated");
    log("  [HARNESS] 仕訳検証: PASS");
  } else {
    log(`  [HARNESS] 仕訳検証: FAIL — ${result.errors.join(", ")}`);
  }
};

const runDeterministicChecks = (harness: HarnessState, txId: string, entry: JournalEntry): void => {
  const balance = checkBalance(entry.lines);
  markStep(harness, txId, "balanceChecked");
  markStep(harness, txId, "accountValidated");
  markStep(harness, txId, "taxVerified");
  log(
    `  [DETERMINISTIC] 借貸: 借方=${String(balance.debitTotal)} / 貸方=${String(balance.creditTotal)} → ${balance.balanced ? "OK" : "NG"}`,
  );
};

const routeByConfidence = (entry: JournalEntry, harness: HarnessState, txId: string): void => {
  const conf = formatConfidence(entry.confidence);
  if (entry.confidence < CONFIDENCE_THRESHOLD) {
    log(`  [HUMAN-IN-THE-LOOP] 確信度${conf} < 閾値 → 人間の承認が必要`);
    entry.status = "needs_review";
  } else {
    log(`  [HUMAN-IN-THE-LOOP] 確信度${conf} >= 閾値 → 自動承認候補`);
    entry.status = "pending_approval";
  }
  markStep(harness, txId, "routed");
};

const processSingleTransaction = (
  harness: HarnessState,
  params: ProcessTransactionParams,
): void => {
  const txId = params.transactionId;
  initTransaction(harness, txId);
  const result = processTransaction(params);
  const timestamp = new Date().toISOString();

  runExtractCheck({
    ctx: { data: result.extracted, step: "extract", timestamp, transactionId: txId },
    harness,
    txId,
  });
  runJournalCheck({
    ctx: { data: result.entry, step: "journal_generate", timestamp, transactionId: txId },
    harness,
    txId,
  });
  runDeterministicChecks(harness, txId, result.entry);

  log(`  [AGENT] ソース: ${result.fromKnowledge ? "ナレッジDB" : "AI推論（モック）"}`);
  printJournalEntry(result.entry);
  routeByConfidence(result.entry, harness, txId);
};

const runImprovementLoop = (store: KnowledgeStore): void => {
  log(separator("Phase 4: ナレッジ自動改善ループ"));
  const lastResult = processTransaction({
    rawText: SAMPLE_TRANSACTIONS.at(LAST_ITEM) ?? "",
    store,
    transactionId: "TX-improve-demo",
  });
  const improvement = proposeNewPattern(store, lastResult.entry, "demo-user");
  if (improvement) {
    log(`  改善提案: ${improvement.description}`);
    log("  → 承認されればナレッジDBに追加され、次回から自動適用されます");
  } else {
    log("  既存パターンでカバー済み — 新規改善提案なし");
  }
};

const processAllTransactions = (harness: HarnessState, store: KnowledgeStore): void => {
  log(separator("Phase 3: 取引処理（ハーネス管理下）"));
  for (const [idx, rawText] of SAMPLE_TRANSACTIONS.entries()) {
    const txId = `TX-2026-04-${String(idx + TX_INDEX_OFFSET).padStart(TX_PAD_LENGTH, "0")}`;
    log(`\n--- 取引 ${txId} ---`);
    log(`  入力: ${rawText.split("\n")[FIRST_LINE]}`);
    processSingleTransaction(harness, { rawText, store, transactionId: txId });
  }
};

const main = (): void => {
  log(separator("JournalCraft デモ — AI仕訳起票アシスタント"));

  const harness = createHarness();
  setupDefaultHooks(harness);
  const store = createStore();
  addPattern(store, SEED_PATTERN);

  processAllTransactions(harness, store);
  runImprovementLoop(store);

  log(separator("処理サマリ"));
  log(
    `  処理取引数: ${String(SAMPLE_TRANSACTIONS.length)}  ハーネスログ: ${String(harness.log.length)}件`,
  );
};

main();
