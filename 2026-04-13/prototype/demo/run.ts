/**
 * デモ実行エントリポイント
 *
 * InvoiceForgeの全パイプラインを実行するCLIデモ。
 * ハーネス→AIエージェント→決定論的検証→人間承認→ナレッジ更新の
 * 一連のフローを体験できる。
 *
 * 使い方:
 *   MOCK_AI=true tsx demo/run.ts   # モックモード（APIキー不要）
 *   tsx demo/run.ts                 # 実APIモード（ANTHROPIC_API_KEY必要）
 */

/* eslint-disable no-console, no-magic-numbers, max-lines-per-function, max-statements, import/no-nodejs-modules, import/no-namespace, require-await, sort-imports, unicorn/prefer-top-level-await, typescript-eslint/strict-boolean-expressions */
import * as readline from "node:readline";

import type { InvoiceInput, JournalEntry, PipelineState } from "../types/index.js";
import { journalToCSV } from "../deterministic/rules.js";
import { afterClassify, beforeParse } from "../harness/lifecycle.js";
import { generateQualitySummary } from "../harness/checker.js";
import {
  createChecklist,
  formatChecklistProgress,
  isComplete,
  updateChecklist,
} from "../harness/planner.js";
import { MOCK_MODE, classifyToJournal, parseInvoice } from "../agent/index.js";
import { analyzeAndPropose, recordConfirmedJournal } from "../knowledge/improver.js";

// ── サンプル請求書テキスト ──

const SAMPLE_INVOICE_TEXT = `
請求書

請求書番号: INV-2026-0413
発行日: 2026年4月1日
支払期限: 2026年4月30日

発行元: テックサービス株式会社
宛先: サンプル商事株式会社

■ 明細
1. クラウドサーバー利用料（4月分）  1式  ¥150,000
2. ドメイン管理・SSL証明書          1式  ¥30,000
3. 技術コンサルティング（4時間）     4h   ¥12,500  ¥50,000

小計: ¥230,000
消費税（10%）: ¥23,000
合計: ¥253,000

振込先: みずほ銀行 渋谷支店 普通 1234567
`;

// ── CLI ユーティリティ ──

const createReadlineInterface = (): readline.Interface =>
  readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

const askQuestion = async (rl: readline.Interface, question: string): Promise<string> =>
  new Promise((resolve) => {
    rl.question(question, resolve);
  });

// ── パイプラインステップ ──

const printHeader = (): void => {
  console.log("\n╔════════════════════════════════════════╗");
  console.log("║     InvoiceForge — 請求書自動仕訳      ║");
  console.log("║   AI Managed Service Prototype v0.1    ║");
  console.log("╚════════════════════════════════════════╝");
  console.log(`\nモード: ${MOCK_MODE ? "モック（APIキー不要）" : "実API（Claude Sonnet）"}`);
};

const printJournal = (journal: JournalEntry): void => {
  console.log("\n┌─── 仕訳候補 ───────────────────────────");
  console.log(`│ 日付: ${journal.date}`);
  console.log(`│ 摘要: ${journal.description}`);
  console.log("├────────────────────────────────────────");
  console.log("│ 勘定科目          │ 借方      │ 貸方");
  console.log("├────────────────────────────────────────");
  for (const entry of journal.entries) {
    const debit = entry.debit > 0 ? `¥${entry.debit.toLocaleString()}` : "";
    const credit = entry.credit > 0 ? `¥${entry.credit.toLocaleString()}` : "";
    console.log(
      `│ ${entry.accountName}(${entry.accountCode})  │ ${debit.padStart(9)} │ ${credit.padStart(9)}`,
    );
  }
  console.log("└────────────────────────────────────────");
};

const runApprovalFlow = async (
  rl: readline.Interface,
  state: PipelineState,
): Promise<PipelineState> => {
  const answer = await askQuestion(rl, "\n承認しますか？ (y=承認 / n=却下 / m=修正して承認): ");

  if (answer.toLowerCase() === "y") {
    return { ...state, approval: "approved" };
  }
  if (answer.toLowerCase() === "m") {
    console.log("\n[修正モード] 実際の製品では仕訳修正UIが表示されます。");
    console.log("プロトタイプでは修正なしで承認扱いとします。");
    return { ...state, approval: "modified" };
  }
  return { ...state, approval: "rejected" };
};

// ── メインパイプライン ──

const runPipeline = async (): Promise<void> => {
  printHeader();
  const rl = createReadlineInterface();

  // 初期状態
  let state: PipelineState = {
    approval: "pending",
    checklist: createChecklist(),
    input: { rawText: SAMPLE_INVOICE_TEXT, source: "manual" } satisfies InvoiceInput,
    validationErrors: [],
  };

  // Step 1: before:parse フック
  console.log("\n── Step 1: 入力検証 (before:parse) ──");
  const parseHook = beforeParse(state.input);
  console.log(`  結果: ${parseHook.passed ? "✓ PASS" : "✗ FAIL"}`);
  for (const warn of parseHook.warnings) {
    console.log(`  ⚠ ${warn}`);
  }
  if (!parseHook.passed) {
    console.log("入力検証に失敗しました。処理を中断します。");
    rl.close();
    return;
  }

  // Step 2: AI解析
  console.log("\n── Step 2: 請求書解析 (AI Agent) ──");
  const parsed = await parseInvoice(state.input.rawText);
  state = { ...state, parsed };
  console.log(`  取引先: ${parsed.vendor}`);
  console.log(`  請求書番号: ${parsed.invoiceNumber}`);
  console.log(`  明細行数: ${parsed.lineItems.length}`);
  console.log(`  合計金額: ¥${parsed.totalAmount.toLocaleString()}`);
  console.log(`  AI確信度: ${(parsed.confidence * 100).toFixed(1)}%`);

  // Step 3: 仕訳推定
  console.log("\n── Step 3: 仕訳推定 (AI Agent) ──");
  const journal = await classifyToJournal(parsed);
  state = { ...state, journal };
  printJournal(journal);

  // Step 4: after:classify フック（品質ゲート）
  console.log("\n── Step 4: 品質ゲート (after:classify) ──");
  const classifyHook = afterClassify(parsed, journal);
  console.log(`  結果: ${classifyHook.passed ? "✓ PASS" : "✗ FAIL"}`);
  for (const err of classifyHook.errors) {
    console.log(`  ✗ ${err}`);
  }
  for (const warn of classifyHook.warnings) {
    console.log(`  ⚠ ${warn}`);
  }
  state = { ...state, validationErrors: classifyHook.validationErrors };

  // 品質サマリ
  console.log(`\n${generateQualitySummary(parsed, journal)}`);

  // チェックリスト更新
  state = { ...state, checklist: updateChecklist(state) };
  console.log(formatChecklistProgress(state.checklist));

  // Step 5: 人間による承認（ヒューマン・イン・ザ・ループ）
  console.log("\n── Step 5: 人間による承認 ──");
  state = await runApprovalFlow(rl, state);

  // チェックリスト最終更新
  state = { ...state, checklist: updateChecklist(state) };
  console.log(formatChecklistProgress(state.checklist));

  if (state.approval === "rejected") {
    console.log("\n却下されました。処理を中断します。");
    rl.close();
    return;
  }

  // Step 6: ナレッジ更新
  console.log("\n── Step 6: ナレッジ更新 ──");
  if (state.journal) {
    recordConfirmedJournal(state.journal);
    console.log("  ✓ 取引先パターンを更新しました");
  }

  // ナレッジ改善提案
  const proposals = analyzeAndPropose();
  if (proposals.length > 0) {
    console.log(`\n  改善提案が ${proposals.length} 件あります:`);
    for (const prop of proposals) {
      console.log(`  - [${prop.type}] ${prop.description}`);
    }
  } else {
    console.log("  （改善提案なし — データ蓄積により将来提案が生成されます）");
  }

  // Step 7: 出力
  console.log("\n── Step 7: 出力 ──");
  if (isComplete(state.checklist) && state.journal) {
    console.log("\n✓ すべての終了条件を満たしました。CSV出力:");
    console.log(`\n${journalToCSV(state.journal)}`);
  } else {
    console.log("\n⚠ 一部の終了条件が未完了です。手動確認が必要です。");
    if (state.journal) {
      console.log(`\n${journalToCSV(state.journal)}`);
    }
  }

  console.log("\n════════════════════════════════════════");
  console.log("  InvoiceForge デモ完了");
  console.log("════════════════════════════════════════\n");
  rl.close();
};

runPipeline().catch(console.error);
