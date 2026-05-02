/**
 * デモ用エントリポイント
 *
 * InvoiceForgeの全パイプラインを実行し、
 * ハーネスによる品質管理とナレッジ改善ループを実証する。
 */
import type {
  AccountMaster,
  ChecklistItem,
  ExtractedData,
  InvoiceInput,
  KnowledgeUpdate,
  ProcessingResult,
} from "../types.ts";
import {
  afterClassifyChecks,
  afterExtractChecks,
  afterJournalizeChecks,
} from "../harness/checker.ts";
import { applyApprovedUpdate, proposeUpdates, queuePendingUpdate } from "../knowledge/improver.ts";
import { evaluateCompletion, formatChecklist } from "../harness/planner.ts";
import { getVendorHistory, updateVendorHistory } from "../knowledge/store.ts";
import { loadJson, log, saveJson } from "./io.ts";
import type { CheckerContext } from "../harness/checker.ts";
import type { ClassificationContext } from "../agent/index.ts";
import type { KnowledgeBase } from "../knowledge/store.ts";
import { executeStep } from "../harness/lifecycle.ts";
import { extractInvoiceData } from "../agent/index.ts";
import { generateJournalEntry } from "../deterministic/rules.ts";

const SEPARATOR_LENGTH = 60;
const EMPTY_COUNT = 0;
const FIRST_INDEX = 0;

const buildFailedResult = (
  invoiceId: string,
  checklist: ChecklistItem[],
  reasons: string[],
): ProcessingResult => ({
  checklist,
  escalationReasons: reasons,
  invoiceId,
  knowledgeUpdates: [],
  status: "escalated",
});

interface ClassifyInput {
  accountMaster: AccountMaster[];
  extractChecklist: ChecklistItem[];
  extracted: ExtractedData;
  invoice: InvoiceInput;
  knowledgeBase: KnowledgeBase;
}

const logJournalEntry = (journal: ReturnType<typeof generateJournalEntry>): void => {
  log("\n[=== 生成された仕訳 ===]");
  log(`  日付: ${journal.date}  取引先: ${journal.vendor}`);
  for (const entry of journal.entries) {
    const side =
      entry.debit > EMPTY_COUNT
        ? `借方 ${entry.debit.toLocaleString()}`
        : `貸方 ${entry.credit.toLocaleString()}`;
    log(`  ${entry.account}: ${side}`);
  }
};

const logPlannerResult = (
  plannerResult: ReturnType<typeof evaluateCompletion>,
  journal: ReturnType<typeof generateJournalEntry> | null,
): void => {
  log("\n[=== 終了条件チェックリスト ===]");
  log(formatChecklist(plannerResult.checklist));
  log(`\n  判定: ${plannerResult.recommendation}`);

  for (const reason of plannerResult.escalationReasons) {
    log(`  [!] ${reason}`);
  }

  if (journal !== null) {
    logJournalEntry(journal);
  }
};

/** 分類・仕訳・終了条件評価を実行 */
const runClassifyAndJournalize = (input: ClassifyInput): ProcessingResult => {
  const { accountMaster, extractChecklist, extracted, invoice, knowledgeBase } = input;
  const vendorHistory = getVendorHistory(knowledgeBase, invoice.vendor);
  const checkerCtx: CheckerContext = { accountMaster, vendorHistory: vendorHistory ?? null };

  const classifyResult = executeStep<ExtractedData, ExtractedData>({
    afterHook: (data) => afterClassifyChecks(data, checkerCtx),
    executor: (data) => data,
    input: extracted,
    log,
    stepName: "分類チェック (Classify)",
  });

  const journalResult = executeStep({
    afterHook: afterJournalizeChecks,
    executor: (data: ExtractedData) => generateJournalEntry(invoice.invoiceId, data),
    input: extracted,
    log,
    stepName: "仕訳生成 (Journalize)",
  });

  const journal = journalResult.data ?? null;
  const allChecks = [...extractChecklist, ...classifyResult.checklist, ...journalResult.checklist];
  const plannerResult = evaluateCompletion(extracted, journal, allChecks);

  logPlannerResult(plannerResult, journal);

  return {
    checklist: allChecks,
    escalationReasons: plannerResult.escalationReasons,
    extractedData: extracted,
    invoiceId: invoice.invoiceId,
    ...(journal === null ? {} : { journalEntry: journal }),
    knowledgeUpdates: [],
    status: plannerResult.recommendation,
  };
};

/** メインパイプライン: 1枚の請求書を処理する */
const processInvoice = (
  invoice: InvoiceInput,
  accountMaster: AccountMaster[],
  knowledgeBase: KnowledgeBase,
): ProcessingResult => {
  log(`\n${"=".repeat(SEPARATOR_LENGTH)}`);
  log(`  InvoiceForge: ${invoice.invoiceId} (${invoice.vendor})`);
  log("=".repeat(SEPARATOR_LENGTH));

  const context: ClassificationContext = {
    accountMaster,
    knowledgeRules: knowledgeBase.rules,
  };

  const extractResult = executeStep<InvoiceInput, ExtractedData>({
    afterHook: afterExtractChecks,
    executor: (inv) => extractInvoiceData(inv, context),
    input: invoice,
    log,
    stepName: "抽出 (Extract)",
  });

  if (!extractResult.success || !("data" in extractResult) || extractResult.data === null) {
    return buildFailedResult(invoice.invoiceId, extractResult.checklist, ["抽出ステップで失敗"]);
  }

  return runClassifyAndJournalize({
    accountMaster,
    extractChecklist: extractResult.checklist,
    extracted: extractResult.data,
    invoice,
    knowledgeBase,
  });
};

/** ユーザー承認をシミュレートする */
const simulateApproval = (kb: KnowledgeBase, update: KnowledgeUpdate): KnowledgeBase => {
  log("\n  [シミュレーション] ユーザーが提案を承認:");
  const result = applyApprovedUpdate(kb, update);
  log(`  → ルール適用完了: ${update.proposedMapping.pattern} → ${update.proposedMapping.account}`);
  return result;
};

/** 更新提案を生成しキューに追加する */
const generateAndQueueUpdates = (knowledgeBase: KnowledgeBase): KnowledgeBase => {
  const updates = proposeUpdates(knowledgeBase, {
    correctedAccount: "外注費",
    itemDescription: "技術サポート月額費用",
    originalAccount: "支払手数料",
    vendor: "株式会社クラウドテック",
  });

  for (const update of updates) {
    log(`\n  [提案] ${update.description}`);
    log(`  [理由] ${update.reason}`);
  }

  let updatedKb = knowledgeBase;
  for (const update of updates) {
    updatedKb = queuePendingUpdate(updatedKb, update);
  }
  log("\n  → 提案をキューに追加しました（ヒューマン・イン・ザ・ループ待ち）");

  const firstUpdate = updates[FIRST_INDEX];
  return typeof firstUpdate === "object" ? simulateApproval(updatedKb, firstUpdate) : updatedKb;
};

/** ナレッジ改善ループのデモ */
const demonstrateKnowledgeLoop = (knowledgeBase: KnowledgeBase): KnowledgeBase => {
  log(`\n${"=".repeat(SEPARATOR_LENGTH)}`);
  log("  ナレッジ自動改善ループ デモ");
  log("=".repeat(SEPARATOR_LENGTH));
  log(
    "\n[シナリオ] ユーザーが「技術サポート月額費用」の勘定科目を「支払手数料」から「外注費」に修正:",
  );
  return generateAndQueueUpdates(knowledgeBase);
};

interface BatchResult {
  knowledgeBase: KnowledgeBase;
  results: ProcessingResult[];
}

/** 全請求書を順番に処理する */
const processAllInvoices = (
  accountMaster: AccountMaster[],
  knowledgeBase: KnowledgeBase,
): BatchResult => {
  const invoiceFiles = ["invoice-001.json", "invoice-002.json", "invoice-003.json"];
  let kb = knowledgeBase;
  const results: ProcessingResult[] = [];

  for (const file of invoiceFiles) {
    const invoice = loadJson<InvoiceInput>(`sample-invoices/${file}`);
    results.push(processInvoice(invoice, accountMaster, kb));
    kb = updateVendorHistory(kb, {
      invoiceDate: invoice.invoiceDate,
      newAmount: invoice.totalAmount,
      vendor: invoice.vendor,
    });
  }

  return { knowledgeBase: kb, results };
};

const logSummary = (results: ProcessingResult[]): void => {
  log(`\n${"=".repeat(SEPARATOR_LENGTH)}`);
  log("  処理サマリー");
  log("=".repeat(SEPARATOR_LENGTH));
  for (const result of results) {
    const statusIcon = result.status === "pending" ? "[ok]" : "[!!]";
    log(`  ${statusIcon} ${result.invoiceId}: ${result.status}`);
    for (const reason of result.escalationReasons) {
      log(`      → ${reason}`);
    }
  }
};

/** メイン実行 */
const main = (): void => {
  log("InvoiceForge - 請求書自動仕訳マネージドサービス プロトタイプ");
  log("============================================================\n");

  const accountMaster = loadJson<AccountMaster[]>("account-master.json");
  const initialKb = loadJson<KnowledgeBase>("knowledge-base.json");
  const { knowledgeBase, results } = processAllInvoices(accountMaster, initialKb);
  const finalKb = demonstrateKnowledgeLoop(knowledgeBase);

  logSummary(results);
  saveJson("knowledge-base-updated.json", finalKb);
  log("\n更新されたナレッジベースを knowledge-base-updated.json に保存しました");
};

main();
