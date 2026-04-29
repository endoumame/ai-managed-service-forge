/* eslint-disable no-console, import/no-nodejs-modules, sort-imports, unicorn/prefer-top-level-await, typescript/no-unsafe-assignment, typescript/no-unsafe-call, typescript/no-unsafe-return, typescript/no-unsafe-argument, typescript/no-unsafe-member-access, typescript/no-unsafe-type-assertion */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import type { ExtractedData, JournalEntry, KnowledgeEntry, RawInvoice } from "../types.ts";
import type { FileAdapter } from "../knowledge/index.ts";
import { checkDuplicateInvoice, formatJournalCsv } from "../deterministic/rules.ts";
import {
  afterExtraction,
  afterJournalEntry,
  beforeExtraction,
  isComplete,
  printChecklist,
} from "../harness/lifecycle.ts";
import { checkAmountAnomaly, checkExtractionQuality } from "../harness/checker.ts";
import {
  createState,
  getProgress,
  recordExtraction,
  recordHighRiskFlagged,
  recordJournal,
} from "../harness/planner.ts";
import { buildJournalEntry, detectAnomalies, extractInvoiceData } from "../agent/index.ts";
import {
  createStore,
  formatProposals,
  generateProposals,
  getVendorHistory,
  recordApproval,
} from "../knowledge/index.ts";

const __dir = typeof import.meta.dirname === "string" ? import.meta.dirname : ".";
const EMPTY_LENGTH = 0;
const AUTO_APPROVE_FLAG = "--auto-approve";
const SEP_LEN = 60;

const knowledgePath = resolve(__dir, "../knowledge/data.json");

const fileAdapter: FileAdapter = {
  exists: (path: string) => existsSync(path),
  readEntries: (path: string): KnowledgeEntry[] => {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    return Array.isArray(parsed) ? (parsed as KnowledgeEntry[]) : [];
  },
  write: (path: string, content: string) => {
    writeFileSync(path, content);
  },
};

const log = (msg: string): void => {
  console.log(msg);
};

const printHeader = (title: string): void => {
  log(`\n${"═".repeat(SEP_LEN)}\n  ${title}\n${"═".repeat(SEP_LEN)}`);
};

const printSection = (title: string): void => {
  log(`\n${"─".repeat(SEP_LEN)}\n  ${title}\n${"─".repeat(SEP_LEN)}`);
};

const printChecks = (
  label: string,
  checks: { message: string; name: string; passed: boolean }[],
): void => {
  log(`\n  ${label}`);
  for (const ch of checks) {
    log(`  ${ch.passed ? "[PASS]" : "[FAIL]"} ${ch.name}: ${ch.message}`);
  }
};

const ask = async (rl: ReturnType<typeof createInterface>, question: string): Promise<string> => {
  const answer = await new Promise<string>((res) => {
    rl.question(question, (ans) => {
      res(ans);
    });
  });
  return answer;
};

interface ProcessContext {
  autoApprove: boolean;
  journals: JournalEntry[];
  processedIds: Set<string>;
  rl: ReturnType<typeof createInterface>;
  state: ReturnType<typeof createState>;
  store: ReturnType<typeof createStore>;
}

const requestApproval = async (ctx: ProcessContext): Promise<boolean> => {
  if (ctx.autoApprove) {
    log("\n  [自動承認モード] => 承認");
    return true;
  }
  const answer = await ask(ctx.rl, "\n  承認しますか？ (y/n): ");
  return answer.toLowerCase() === "y";
};

const checkFormat = (invoice: RawInvoice): boolean => {
  const preCheck = beforeExtraction(invoice as unknown as Record<string, unknown>);
  printChecks("[ハーネス] 前処理バリデーション:", preCheck.checks);
  if (!preCheck.passed) {
    log("  => スキップ（前処理バリデーション失敗）");
  }
  return preCheck.passed;
};

const checkDuplicate = (invoice: RawInvoice, ctx: ProcessContext): boolean => {
  const dupCheck = checkDuplicateInvoice(invoice.id, ctx.processedIds);
  printChecks("[決定論的] 重複チェック:", dupCheck.checks);
  if (!dupCheck.passed) {
    log("  => スキップ（重複検出）");
  }
  return dupCheck.passed;
};

const validatePrereqs = (invoice: RawInvoice, ctx: ProcessContext): boolean =>
  checkFormat(invoice) && checkDuplicate(invoice, ctx);

const extractAndValidate = (invoice: RawInvoice, ctx: ProcessContext): ExtractedData => {
  ctx.processedIds.add(invoice.id);
  const extracted = extractInvoiceData(invoice);
  const numericCheck = afterExtraction(extracted);
  printChecks("[ハーネス] 数値整合性チェック:", numericCheck.checks);
  ctx.state = recordExtraction(ctx.state, invoice.id, numericCheck);
  log(`  ${getProgress(ctx.state)}`);
  return extracted;
};

const flagIfNeeded = (extracted: ExtractedData, ctx: ProcessContext): void => {
  const history = getVendorHistory(ctx.store, extracted.vendorNameNormalized);
  const reasons = [
    ...checkExtractionQuality(extracted).reasons,
    ...checkAmountAnomaly(extracted.total, history).reasons,
    ...detectAnomalies(extracted, history),
  ];
  if (reasons.length > EMPTY_LENGTH) {
    log("\n  [ハーネス] 要ヒューマンレビュー:");
    for (const reason of reasons) {
      log(`    - ${reason}`);
    }
    ctx.state = recordHighRiskFlagged(ctx.state);
  }
};

const printJournalSummary = (journal: JournalEntry): void => {
  printChecks("[ハーネス] 仕訳バリデーション:", afterJournalEntry(journal).checks);
  log(`  判定理由: ${journal.reasoning}\n  仕訳内容:`);
  for (const en of journal.entries) {
    const side = en.side === "debit" ? "借方" : "貸方";
    log(
      `    ${side}: ${en.accountName}(${en.accountCode}) ¥${en.amount.toLocaleString()} - ${en.description}`,
    );
  }
};

const learnFromApproval = (
  journal: JournalEntry,
  extracted: ExtractedData,
  ctx: ProcessContext,
): void => {
  for (const item of extracted.items) {
    const matched = journal.entries.find((en) => en.description === item.description);
    if (matched) {
      recordApproval({
        accountCode: matched.accountCode,
        accountName: matched.accountName,
        itemKeyword: item.description,
        store: ctx.store,
        vendorName: extracted.vendorNameNormalized,
      });
    }
  }
};

const processJournal = async (
  journal: JournalEntry,
  extracted: ExtractedData,
  ctx: ProcessContext,
): Promise<void> => {
  printJournalSummary(journal);
  const approved = await requestApproval(ctx);
  if (approved) {
    ctx.journals.push(journal);
    learnFromApproval(journal, extracted, ctx);
  }
  ctx.state = recordJournal({ balanceValid: afterJournalEntry(journal).passed, state: ctx.state });
};

const processInvoice = async (invoice: RawInvoice, ctx: ProcessContext): Promise<void> => {
  printSection(`請求書: ${invoice.id} (${invoice.vendor})`);
  if (!validatePrereqs(invoice, ctx)) {
    return;
  }
  const extracted = extractAndValidate(invoice, ctx);
  flagIfNeeded(extracted, ctx);
  const journal = buildJournalEntry({ extracted, knownVendorPatterns: new Map() });
  await processJournal(journal, extracted, ctx);
};

const loadInvoices = (): RawInvoice[] => {
  const mockPath = resolve(__dir, "mock-invoices.json");
  const parsed: unknown = JSON.parse(readFileSync(mockPath, "utf8"));
  return Array.isArray(parsed) ? (parsed as RawInvoice[]) : [];
};

const printFinalReport = (ctx: ProcessContext): void => {
  printHeader("処理完了 — 終了条件チェックリスト");
  log(printChecklist(ctx.state.checklist));
  log(`\n  全条件達成: ${isComplete(ctx.state.checklist) ? "はい" : "いいえ"}`);
  if (ctx.journals.length > EMPTY_LENGTH) {
    printSection("仕訳データ出力（CSV形式）");
    const csv = formatJournalCsv(ctx.journals);
    log(csv);
    const outPath = resolve(__dir, "../output.csv");
    writeFileSync(outPath, csv);
    log(`\n  => ${outPath} に保存しました`);
  }
};

const initContext = (invoices: RawInvoice[], autoApprove: boolean): ProcessContext => ({
  autoApprove,
  journals: [],
  processedIds: new Set(),
  rl: createInterface({ input: process.stdin, output: process.stdout }),
  state: createState(invoices.length),
  store: createStore(knowledgePath, fileAdapter),
});

const STEP = 1;

const processAll = async (
  invoices: RawInvoice[],
  idx: number,
  ctx: ProcessContext,
): Promise<void> => {
  if (idx >= invoices.length) {
    return;
  }
  await processInvoice(invoices[idx], ctx);
  await processAll(invoices, idx + STEP, ctx);
};

const finalize = (ctx: ProcessContext): void => {
  printFinalReport(ctx);
  printSection("ナレッジ自動改善提案");
  log(formatProposals(generateProposals(ctx.store)));
  printHeader("デモ完了");
  ctx.rl.close();
};

const main = async (): Promise<void> => {
  const autoApprove: boolean = process.argv.includes(AUTO_APPROVE_FLAG);
  printHeader("InvoiceForge — 請求書自動仕訳マネージドサービス（プロトタイプ）");
  const invoices = loadInvoices();
  log(`  モード: ${autoApprove ? "自動承認" : "対話型"} | 請求書数: ${invoices.length}件`);
  const ctx = initContext(invoices, autoApprove);
  await processAll(invoices, EMPTY_LENGTH, ctx);
  finalize(ctx);
};

await main();
