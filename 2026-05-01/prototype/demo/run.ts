import type { ExtractedInvoiceData, Invoice, JournalEntry, KnowledgeBase } from "../types.ts";
import { addCorrection, incrementProcessedCount, load, save } from "../knowledge/store.ts";
import {
  analyzeCorrection,
  applyProposal,
  generateCorrectionRecord,
} from "../knowledge/improver.ts";
import { classifyInvoice, extractInvoiceData } from "../agent/index.ts";
import { evaluateChecklist, formatChecklist, isComplete } from "../harness/planner.ts";
import type { CorrectionInput } from "../knowledge/improver.ts";
import { runHook } from "../harness/lifecycle.ts";
import { runQualityChecks } from "../harness/checker.ts";
import { sampleInvoices } from "./sample-invoices.ts";

// oxlint-disable eslint(no-magic-numbers),eslint(no-console),typescript-eslint(no-unsafe-member-access),typescript-eslint(no-unsafe-assignment),typescript-eslint(no-unsafe-call) -- デモ用CLIスクリプト

const SEPARATOR = "═".repeat(60);
const THIN_SEP = "─".repeat(60);

const logPhase = (phase: string): void => {
  console.log(`\n${THIN_SEP}\n  ${phase}\n${THIN_SEP}`);
};

const logHookResult = (
  phase: string,
  result: { passed: boolean; errors: string[]; warnings: string[] },
): void => {
  const status = result.passed ? "PASS" : "FAIL";
  const lines = [
    `  [${status}] ${phase}`,
    ...result.errors.map((err) => `    ERROR: ${err}`),
    ...result.warnings.map((warn) => `    WARN: ${warn}`),
  ];
  console.log(lines.join("\n"));
};

interface HookCall {
  label: string;
  phase: Parameters<typeof runHook>[0];
  invoice: Invoice;
  extra?: Parameters<typeof runHook>[2];
}

const executeHook = (call: HookCall): { passed: boolean } => {
  logPhase(call.label);
  const result = runHook(call.phase, call.invoice, call.extra);
  logHookResult(call.phase, result);
  return result;
};

const createInvoice = (id: string, rawText: string): Invoice => ({
  anomalies: [],
  extractedData: null,
  id,
  journalEntry: null,
  rawText,
  status: "pending",
  validationErrors: [],
});

const formatExtractedLines = (data: ExtractedInvoiceData): string[] => [
  `  取引先: ${data.vendorName}`,
  `  請求書番号: ${data.invoiceNumber}`,
  `  発行日: ${data.invoiceDate}`,
  `  支払期日: ${data.dueDate ?? "(なし)"}`,
  `  品目数: ${data.items.length}件`,
  `  小計: ${data.subtotal.toLocaleString()}円`,
  `  消費税: ${data.taxAmount.toLocaleString()}円`,
  `  合計: ${data.totalAmount.toLocaleString()}円`,
];

const displayExtractedData = (invoice: Invoice): void => {
  if (invoice.extractedData === null) {
    return;
  }
  for (const line of formatExtractedLines(invoice.extractedData)) {
    console.log(line);
  }
};

const formatJournalLines = (entry: JournalEntry): string[] => {
  const debitLines = entry.debitEntries.map(
    (de) => `    ${de.accountCode} ${de.accountName}: ${de.amount.toLocaleString()}円`,
  );
  const creditLines = entry.creditEntries.map(
    (ce) => `    ${ce.accountCode} ${ce.accountName}: ${ce.amount.toLocaleString()}円`,
  );
  return [
    `  信頼度: ${(entry.confidence * 100).toFixed(0)}%`,
    `  摘要: ${entry.description}`,
    "  【借方】",
    ...debitLines,
    "  【貸方】",
    ...creditLines,
  ];
};

const displayJournalEntry = (invoice: Invoice): void => {
  if (invoice.journalEntry === null) {
    return;
  }
  for (const line of formatJournalLines(invoice.journalEntry)) {
    console.log(line);
  }
};

const performExtraction = async (invoice: Invoice): Promise<boolean> => {
  logPhase("Step 2: データ抽出（AI/モック）");
  const extraction = await extractInvoiceData(invoice);
  if (!extraction.success || extraction.data === null) {
    console.log(`  ERROR: ${extraction.error}`);
    return false;
  }
  invoice.extractedData = extraction.data;
  invoice.status = "extracted";
  displayExtractedData(invoice);
  executeHook({
    extra: { extracted: extraction.data },
    invoice,
    label: "Step 3: afterExtract フック",
    phase: "afterExtract",
  });
  return true;
};

const runExtraction = async (invoice: Invoice): Promise<boolean> => {
  const preCheck = executeHook({
    invoice,
    label: "Step 1: beforeExtract フック",
    phase: "beforeExtract",
  });
  if (!preCheck.passed) {
    return false;
  }
  const result = await performExtraction(invoice);
  return result;
};

const runClassification = (invoice: Invoice, kb: KnowledgeBase): void => {
  executeHook({
    extra: { knowledgeBase: kb },
    invoice,
    label: "Step 4: beforeClassify フック",
    phase: "beforeClassify",
  });

  logPhase("Step 5: 勘定科目分類（決定論的ルール + AI信頼度）");
  if (invoice.extractedData === null) {
    throw new Error("extractedData is null");
  }
  invoice.journalEntry = classifyInvoice(invoice.extractedData, kb);
  invoice.status = "classified";
  displayJournalEntry(invoice);

  logPhase("Step 6: afterClassify フック");
  logHookResult("afterClassify", runHook("afterClassify", invoice));
};

const runPipelineSteps = async (invoice: Invoice, kb: KnowledgeBase): Promise<Invoice | null> => {
  const extracted = await runExtraction(invoice);
  if (!extracted) {
    return null;
  }
  runClassification(invoice, kb);
  return invoice;
};

const runValidation = (invoice: Invoice): void => {
  logPhase("Step 7: 品質チェック（決定論的バリデーション）");
  const quality = runQualityChecks(invoice);
  for (const check of quality.checks) {
    const mark = check.passed ? "OK" : "NG";
    console.log(`  [${mark}] ${check.name}: ${check.message}`);
  }

  logPhase("Step 8: 完了チェックリスト（ハーネス外部管理）");
  invoice.status = "awaiting_approval";
  const checklist = evaluateChecklist(invoice);
  console.log(formatChecklist(checklist));
  console.log(`  → ${isComplete(checklist) ? "全条件クリア" : "未完了の条件あり"}`);
};

const buildCorrectionInput = (invoice: Invoice): CorrectionInput | null => {
  const items = invoice.extractedData?.items ?? [];
  if (items.length === 0) {
    return null;
  }
  const [firstItem] = items;
  return {
    correctedAccountCode: "4310",
    correctedAccountName: "通信費",
    invoiceId: invoice.id,
    itemDescription: firstItem.description,
    originalAccountCode: invoice.journalEntry?.debitEntries[0]?.accountCode ?? "",
    vendorName: invoice.extractedData?.vendorName ?? "",
  };
};

const simulateCorrection = (invoice: Invoice, kb: KnowledgeBase): KnowledgeBase => {
  logPhase("Step 10: ナレッジ自動改善ループ（シミュレーション）");
  const input = buildCorrectionInput(invoice);
  if (input === null) {
    return kb;
  }

  const correction = generateCorrectionRecord(input);
  const kbWithCorrection = addCorrection(kb, correction);
  const proposal = analyzeCorrection(kbWithCorrection, correction);
  console.log(`  修正シミュレーション: ${input.itemDescription}`);
  console.log(`  提案: ${proposal.description}\n  → 自動承認（デモモード）`);
  return applyProposal(kbWithCorrection, proposal);
};

const logHeader = (title: string): void => {
  console.log(`\n${SEPARATOR}\n  ${title}\n${SEPARATOR}`);
};

const handleApproval = (invoice: Invoice, kb: KnowledgeBase, isLast: boolean): KnowledgeBase => {
  logPhase("Step 9: 承認フロー（ヒューマン・イン・ザ・ループ）");
  if (isLast) {
    console.log("  → 修正シナリオをデモ（最後の請求書で改善ループを実証）");
    invoice.status = "corrected";
    return incrementProcessedCount(simulateCorrection(invoice, kb));
  }
  console.log("  → 自動承認（デモモード）");
  invoice.status = "approved";
  return incrementProcessedCount(kb);
};

const processInvoice = async (
  sample: { id: string; rawText: string },
  kb: KnowledgeBase,
  isLast: boolean,
): Promise<KnowledgeBase> => {
  logHeader(`請求書処理: ${sample.id}`);
  const invoice = await runPipelineSteps(createInvoice(sample.id, sample.rawText), kb);
  if (invoice === null) {
    return kb;
  }
  runValidation(invoice);
  return handleApproval(invoice, kb, isLast);
};

const printSummary = (kb: KnowledgeBase): void => {
  logHeader("処理完了サマリー");
  console.log(
    `  処理済み: ${kb.processedCount}件\n  マッピング数: ${kb.accountMappings.length}件\n  修正履歴: ${kb.correctionHistory.length}件`,
  );
};

const processAllInvoices = async (initialKb: KnowledgeBase): Promise<KnowledgeBase> => {
  let kb = initialKb;
  const lastIdx = sampleInvoices.length - 1;
  // oxlint-disable-next-line eslint(no-await-in-loop) -- 各請求書の処理は前回の結果に依存するため逐次実行が必要
  for (const [idx, sample] of sampleInvoices.entries()) {
    // oxlint-disable-next-line eslint(no-await-in-loop)
    kb = await processInvoice(sample, kb, idx === lastIdx);
    save(kb);
  }
  return kb;
};

const main = async (): Promise<void> => {
  logHeader("InvoiceForge — AI請求書自動仕訳マネージドサービス プロトタイプデモ");
  const kb = load();
  console.log(
    `ナレッジベース: ${kb.processedCount}件処理済み, ${kb.accountMappings.length}件のマッピング`,
  );
  const finalKb = await processAllInvoices(kb);
  printSummary(finalKb);
};

await main();
