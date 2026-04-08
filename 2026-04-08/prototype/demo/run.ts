/* eslint-disable no-console, max-statements, no-magic-numbers, sort-imports, typescript/no-unsafe-member-access -- Demo entry point requires console output and orchestration logic */
/**
 * InvoicePilot デモエントリポイント
 *
 * なぜこの実装か:
 * AIマネージドサービスの3層アーキテクチャ（ハーネス・AI・決定論的コード）を
 * 一つのパイプラインとして実行し、思想を具体的なコードで実証する。
 * MOCK_AI=true で APIキーなしでもデモ可能。
 */

import { extractInvoiceData } from "../agent/index.ts";
import { createJournalEntry, determineApprovalLevel } from "../deterministic/rules.ts";
import type { ExtractedInvoice } from "../deterministic/rules.ts";
import { evaluateQuality, formatQualityReport } from "../harness/checker.ts";
import type { StageResult } from "../harness/checker.ts";
import {
  afterExtraction,
  afterJournalEntry,
  beforeExtraction,
  beforeJournalEntry,
} from "../harness/lifecycle.ts";
import type { HookResult } from "../harness/lifecycle.ts";
import {
  createPipelineState,
  formatPipelineStatus,
  markConditionComplete,
} from "../harness/planner.ts";
import type { PipelineState } from "../harness/planner.ts";
import { recordMapping } from "../knowledge/store.ts";
import { formatProposal, getPendingProposals, trackCorrection } from "../knowledge/improver.ts";

const SAMPLE_INVOICE = `
請求書
請求書番号: INV-2026-0042
発行日: 2026年3月31日

請求元: 株式会社テックサービス
〒100-0001 東京都千代田区千代田1-1-1

請求先: 御社

品目:
  1. クラウドサーバー利用料（3月分）  50,000円
  2. ソフトウェアライセンス（年間）    30,000円

小計: 80,000円
消費税（10%）: 8,000円
合計: 88,000円

お支払期限: 2026年4月30日
振込先: みずほ銀行 本店 普通 1234567
`;

const SAMPLE_INVOICE_2 = `
請求書
請求書番号: INV-2026-0098
発行日: 2026年4月5日

請求元: 株式会社サクラオフィス
〒150-0001 東京都渋谷区神宮前2-3-4

品目:
  1. コピー用紙 A4 (10箱)  30,000円
  2. トナーカートリッジ (5個)  25,000円

小計: 55,000円
消費税（10%）: 5,500円
合計: 60,500円

お支払期限: 2026年5月10日
`;

const SAMPLE_INVOICE_3 = `
請求書
請求書番号: INV-2026-0123
発行日: 2026年4月7日

請求元: 全日本配送株式会社

品目:
  1. 国内配送料（4月分）  120,000円
  2. 梱包資材費           15,000円

小計: 135,000円
消費税（10%）: 13,500円
合計: 148,500円
`;

const _UNUSED_INVOICES = [SAMPLE_INVOICE_2, SAMPLE_INVOICE_3];

const DIVIDER = "=".repeat(50);

const log = (message: string): void => {
  console.log(message);
};

const logStep = (step: string): void => {
  log("");
  log(DIVIDER);
  log(`  ${step}`);
  log(DIVIDER);
};

const logHookResult = (name: string, result: HookResult): void => {
  const icon = result.passed ? "[PASS]" : "[FAIL]";
  log(`  ${name}: ${icon}`);
  for (const check of result.checks) {
    const ci = check.passed ? "  [v]" : "  [x]";
    log(`  ${ci} ${check.name}`);
  }
};

const runPreExtraction = (
  invoice: string,
  state: PipelineState,
): { result: HookResult; state: PipelineState } => {
  logStep("Step 1: 前処理チェック (beforeExtraction)");
  const result = beforeExtraction(invoice);
  logHookResult("beforeExtraction", result);
  const updated = markConditionComplete(state, "input_validated", result.passed);
  log(formatPipelineStatus(updated));
  return { result, state: updated };
};

const runExtraction = async (
  invoice: string,
  state: PipelineState,
): Promise<{ data: ExtractedInvoice; state: PipelineState }> => {
  logStep("Step 2: AI 請求書データ抽出");
  const data = await extractInvoiceData(invoice);
  log(`  取引先: ${data.vendorName}`);
  log(`  日付: ${data.invoiceDate}`);
  log(`  合計: ${data.totalAmount.toLocaleString()}円`);
  log(`  明細数: ${data.items.length}件`);
  const updated = markConditionComplete(state, "data_extracted", true);
  return { data, state: updated };
};

const runPostExtraction = (
  data: ExtractedInvoice,
  state: PipelineState,
): { result: HookResult; state: PipelineState } => {
  logStep("Step 3: 抽出結果バリデーション (afterExtraction)");
  const result = afterExtraction(data);
  logHookResult("afterExtraction", result);
  const updated = markConditionComplete(state, "extraction_validated", result.passed);
  return { result, state: updated };
};

const runJournalCreation = (
  data: ExtractedInvoice,
  state: PipelineState,
): { stages: StageResult[]; state: PipelineState } => {
  logStep("Step 4: 仕訳生成 + バリデーション");
  const entry = createJournalEntry(data);
  log(
    `  借方: ${entry.debitAccountCode} ${entry.debitAccountName} ${entry.debitAmount.toLocaleString()}円`,
  );
  log(
    `  貸方: ${entry.creditAccountCode} ${entry.creditAccountName} ${entry.creditAmount.toLocaleString()}円`,
  );

  const preResult = beforeJournalEntry(entry);
  logHookResult("beforeJournalEntry", preResult);
  const postResult = afterJournalEntry(entry, null);
  logHookResult("afterJournalEntry", postResult);

  const afterCreate = markConditionComplete(state, "journal_entry_created", true);
  const afterValidate = markConditionComplete(afterCreate, "journal_validated", preResult.passed);

  const stages: StageResult[] = [
    { hookResult: preResult, stage: "仕訳前チェック" },
    { hookResult: postResult, stage: "仕訳後チェック" },
  ];
  return { stages, state: afterValidate };
};

const runQualityCheck = (
  preStage: StageResult,
  extractStage: StageResult,
  journalStages: StageResult[],
): void => {
  logStep("Step 5: 品質チェック総合判定");
  const allStages = [preStage, extractStage, ...journalStages];
  const report = evaluateQuality(allStages);
  log(formatQualityReport(report));
};

const runApproval = (data: ExtractedInvoice, state: PipelineState): PipelineState => {
  logStep("Step 6: 承認フロー (ヒューマン・イン・ザ・ループ)");
  const approval = determineApprovalLevel(data.totalAmount);
  log(`  承認レベル: ${approval.level} (${approval.approver})`);
  log(`  理由: ${approval.reason}`);
  log("  >> デモモード: 自動承認します");
  return markConditionComplete(state, "human_reviewed", true);
};

const runKnowledgeUpdate = (data: ExtractedInvoice): void => {
  logStep("Step 7: ナレッジ更新 + 改善ループ");
  for (const item of data.items) {
    recordMapping({
      accountCode: "540",
      accountName: "通信費",
      itemPattern: item.name,
      vendorName: data.vendorName,
    });
    log(`  記録: ${data.vendorName} / ${item.name}`);
  }

  trackCorrection({
    correctedCode: "540",
    correctedName: "通信費",
    itemPattern: data.items[0]?.name ?? "",
    previousCode: "630",
    timestamp: new Date().toISOString(),
    vendorName: data.vendorName,
  });

  const proposals = getPendingProposals();
  log(`  改善提案キュー: ${proposals.length}件`);
  for (const proposal of proposals) {
    log(formatProposal(proposal));
  }
};

const main = async (): Promise<void> => {
  log("InvoicePilot プロトタイプ デモ");
  log("AIマネージドサービス: 請求書処理の自動化");
  log(DIVIDER);

  const initial = createPipelineState("INV-2026-0042");
  const pre = runPreExtraction(SAMPLE_INVOICE, initial);
  const extraction = await runExtraction(SAMPLE_INVOICE, pre.state);
  const postExt = runPostExtraction(extraction.data, extraction.state);
  const journal = runJournalCreation(extraction.data, postExt.state);

  const preStage: StageResult = { hookResult: pre.result, stage: "前処理" };
  const extStage: StageResult = { hookResult: postExt.result, stage: "抽出バリデーション" };
  runQualityCheck(preStage, extStage, journal.stages);

  const finalState = runApproval(extraction.data, journal.state);
  runKnowledgeUpdate(extraction.data);

  logStep("完了");
  log(formatPipelineStatus(finalState));
  log("");
  log("デモ完了: 全パイプラインが正常に実行されました。");
};

// eslint-disable-next-line unicorn/prefer-top-level-await -- Entry point needs error handling wrapper
main().catch((error: unknown) => {
  console.error("デモ実行エラー:", error);
  process.exitCode = 1;
});
