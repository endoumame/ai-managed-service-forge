/* eslint-disable no-magic-numbers, require-await, max-statements, max-lines-per-function, id-length, no-console, no-undefined, no-await-in-loop, no-use-before-define, sort-imports, max-params, unicorn/consistent-function-scoping, unicorn/prefer-top-level-await, unicorn/no-array-callback-reference, import/no-nodejs-modules, import/no-duplicates, typescript/no-unsafe-member-access, typescript/no-unsafe-call, typescript/no-unsafe-assignment, typescript/no-unsafe-argument, typescript/no-unsafe-type-assertion, typescript/no-non-null-assertion, typescript/explicit-function-return-type, typescript/require-await, typescript/strict-boolean-expressions, typescript/consistent-type-imports, prefer-destructuring */
// InvoiceForge デモ: 請求書自動仕訳パイプライン
// ハーネス（ライフサイクル管理）→ AIエージェント（抽出・分類）→ 決定論的検証 の三位一体を実証

import type { HarnessContext } from "../types.ts";
import { classifyAccount, createConfig, extractInvoice, getAccountName } from "../agent/index.ts";
import { formatCurrency, formatJournalAsCSV } from "../deterministic/rules.ts";
import { createInitialChecklist, formatChecklistReport, isComplete } from "../harness/planner.ts";
import { executeHooks, registerDefaultHooks } from "../harness/lifecycle.ts";
import { detectConflicts, formatProposalReport, proposeNewMapping } from "../knowledge/improver.ts";
import { loadStore, lookupVendor, recordMapping, saveStore } from "../knowledge/store.ts";
import { validateJournal } from "../harness/checker.ts";

const SEPARATOR_LENGTH = 60;
const SEPARATOR = "=".repeat(SEPARATOR_LENGTH);
const PERCENTAGE = 100;
const ZERO = 0;

const SAMPLE_INVOICES = [
  `請求書
取引先: 株式会社クラウドネット
請求書番号: INV-2026-0042
請求日: 2026-05-20
適格請求書発行事業者番号: T1234567890123

品目: インターネット回線利用料（5月分）
数量: 1
単価: ¥15,000

小計: ¥15,000
消費税: ¥1,500
合計: ¥16,500`,

  `請求書
取引先: オフィスサプライ合同会社
請求書番号: OS-20260525-001
請求日: 2026-05-25

品目: コピー用紙 A4 5000枚
数量: 10
単価: ¥2,500

小計: ¥25,000
消費税: ¥2,500
合計: ¥27,500`,

  `請求書
取引先: 株式会社クラウドネット
請求書番号: INV-2026-0043
請求日: 2026-05-25

品目: クラウドサーバー利用料（5月分）
数量: 1
単価: ¥50,000

小計: ¥50,000
消費税: ¥5,000
合計: ¥55,000`,
];

const log = (message: string): void => {
  console.log(message); // eslint-disable-line no-console
};

const isEmpty = (arr: unknown[]): boolean => arr.length === ZERO;

const initializeHarness = (
  lookupFn: (vendorName: string) => import("../types.ts").KnowledgeEntry[],
  invoiceText: string,
): HarnessContext => {
  registerDefaultHooks({
    knowledgeLookup: lookupFn,
    validateJournal,
  });

  return {
    checklist: createInitialChecklist(),
    humanReviewReasons: [],
    humanReviewRequired: false,
    invoice: { rawText: invoiceText },
    knowledgeHints: [],
  };
};

const logExtractedInfo = (extracted: import("../types.ts").ExtractedInvoice): void => {
  log(`  取引先: ${extracted.vendorName}`);
  log(`  請求書番号: ${extracted.invoiceNumber}`);
  log(`  合計金額: ${formatCurrency(extracted.totalAmount)}`);
};

const runExtraction = async (
  initialCtx: HarnessContext,
  config: ReturnType<typeof createConfig>,
): Promise<{
  extracted: import("../types.ts").ExtractedInvoice;
  validatedCtx: HarnessContext;
}> => {
  log("\n[ハーネス] before:extract フック実行中...");
  const preExtractCtx = await executeHooks("before:extract", initialCtx);
  log("  テキスト正規化が完了しました");

  log(
    `\n[AIエージェント] 請求書から項目を抽出中...（モード: ${config.useMock ? "モック" : "Claude API"}）`,
  );
  const extracted = await extractInvoice(preExtractCtx.invoice.rawText, config);
  logExtractedInfo(extracted);

  log("\n[ハーネス] after:extract フック実行中...");
  const validatedCtx = await executeHooks("after:extract", { ...preExtractCtx, extracted });
  return { extracted, validatedCtx };
};

const logKnowledgeHints = (preClassifyCtx: HarnessContext): void => {
  if (preClassifyCtx.knowledgeHints.length > ZERO) {
    log(
      `  ナレッジヒント: ${preClassifyCtx.knowledgeHints.map((hint) => `${hint.accountName}（過去${hint.frequency}回）`).join(", ")}`,
    );
  } else {
    log("  過去のマッピングなし（新規取引先の可能性）");
  }
};

const logJournalInfo = (journal: import("../types.ts").JournalEntry, accountName: string): void => {
  log(`  勘定科目: ${accountName}（${journal.debitAccount}）`);
  log(`  信頼度: ${(journal.confidence * PERCENTAGE).toFixed(ZERO)}%`);
};

const getExtractedOrThrow = (ctx: HarnessContext): import("../types.ts").ExtractedInvoice => {
  const extractedData = ctx.extracted;
  if (!extractedData) {
    throw new Error("抽出データが見つかりません");
  }
  return extractedData;
};

const executeHookWithLog = async (
  phase: "before:classify" | "after:classify",
  ctx: HarnessContext,
): Promise<HarnessContext> => {
  log(`\n[ハーネス] ${phase} フック実行中...`);
  const result = await executeHooks(phase, ctx);
  return result;
};

const runClassification = async (
  validatedExtractCtx: HarnessContext,
  store: import("../types.ts").KnowledgeStore,
): Promise<{
  journal: import("../types.ts").JournalEntry;
  finalCtx: HarnessContext;
  accountName: string;
}> => {
  const preClassifyCtx = await executeHookWithLog("before:classify", validatedExtractCtx);
  logKnowledgeHints(preClassifyCtx);

  log("\n[AIエージェント] 勘定科目を推定中...");
  const extractedData = getExtractedOrThrow(preClassifyCtx);
  const journal = await classifyAccount(extractedData, preClassifyCtx.knowledgeHints, store);
  const accountName = getAccountName(journal.debitAccount) ?? "不明";
  logJournalInfo(journal, accountName);

  const finalCtx = await executeHookWithLog("after:classify", { ...preClassifyCtx, journal });
  return { accountName, finalCtx, journal };
};

interface KnowledgeUpdateInput {
  store: import("../types.ts").KnowledgeStore;
  finalCtx: HarnessContext;
  extracted: import("../types.ts").ExtractedInvoice;
  journal: import("../types.ts").JournalEntry;
  accountName: string;
  storePath: string;
}

const saveCompletedMapping = (
  store: import("../types.ts").KnowledgeStore,
  input: KnowledgeUpdateInput,
): import("../types.ts").KnowledgeStore => {
  if (!isComplete(input.finalCtx.checklist)) {
    return store;
  }
  const updated = recordMapping(store, {
    accountCode: input.journal.debitAccount,
    accountName: input.accountName,
    vendorName: input.extracted.vendorName,
  });
  saveStore(updated, input.storePath);
  log("[ナレッジ] マッピングを記録しました");
  return updated;
};

const proposeIfNewVendor = (
  store: import("../types.ts").KnowledgeStore,
  input: KnowledgeUpdateInput,
): void => {
  const existingHint = lookupVendor(store, input.extracted.vendorName);
  if (!isEmpty(existingHint)) {
    return;
  }
  const proposal = proposeNewMapping(
    input.extracted.vendorName,
    input.journal.debitAccount,
    input.accountName,
  );
  const updated = { ...store, improvements: [...store.improvements, proposal] };
  saveStore(updated, input.storePath);
  log(`[ナレッジ改善] 新規マッピング提案を生成: ${proposal.reason}`);
};

const updateKnowledge = (input: KnowledgeUpdateInput): void => {
  const afterMapping = saveCompletedMapping(input.store, input);
  proposeIfNewVendor(afterMapping, input);
};

const logInvoiceHeader = (): void => {
  log(`\n${SEPARATOR}`);
  log("請求書を受領しました。処理を開始します...");
  log(SEPARATOR);
};

const logHumanReview = (ctx: HarnessContext): void => {
  if (ctx.humanReviewRequired) {
    log("[ヒューマン・イン・ザ・ループ] 人間による確認が必要です");
    log("  （デモのため自動承認します）\n");
  }
};

const logJournalResult = (journal: import("../types.ts").JournalEntry): void => {
  log(`\n${SEPARATOR}`);
  log("生成された仕訳データ:");
  log(SEPARATOR);
  log(formatJournalAsCSV([journal]));
};

// eslint-disable-next-line max-lines-per-function -- demo orchestration requires sequential steps
const processInvoice = async (invoiceText: string, storePath: string): Promise<void> => {
  const config = createConfig();
  const store = loadStore(storePath);
  logInvoiceHeader();

  const initialCtx = initializeHarness(
    (vendorName) => lookupVendor(store, vendorName),
    invoiceText,
  );
  const { extracted, validatedCtx } = await runExtraction(initialCtx, config);
  const { journal, finalCtx, accountName } = await runClassification(validatedCtx, store);

  log(`\n${formatChecklistReport(finalCtx)}`);
  logHumanReview(finalCtx);
  updateKnowledge({ accountName, extracted, finalCtx, journal, store, storePath });
  logJournalResult(journal);
};

const printBanner = (): void => {
  log("╔══════════════════════════════════════════════════════════╗");
  log("║  InvoiceForge - 請求書自動仕訳マネージドサービス        ║");
  log("║  プロトタイプデモ                                       ║");
  log("╚══════════════════════════════════════════════════════════╝");
  log("");
  log("三位一体アーキテクチャ:");
  log("  [ハーネス] ライフサイクル管理 + 終了条件チェック + 品質検証");
  log("  [AIエージェント] 項目抽出 + 勘定科目推定");
  log("  [決定論的コード] 税額計算 + 金額突合 + フォーマット変換");
};

const printFinalReport = (storePath: string): void => {
  const finalStore = loadStore(storePath);
  const conflicts = detectConflicts(finalStore);
  const allProposals = [...finalStore.improvements, ...conflicts];

  log(`\n${SEPARATOR}`);
  log("ナレッジ自動改善レポート");
  log(SEPARATOR);
  log(formatProposalReport(allProposals));
  log("\nデモ完了。");
};

const runDemo = async (): Promise<void> => {
  printBanner();
  const storePath = new URL("../knowledge/data.json", import.meta.url).pathname;

  for (const invoice of SAMPLE_INVOICES) {
    await processInvoice(invoice, storePath); // eslint-disable-line no-await-in-loop -- sequential processing by design
  }

  printFinalReport(storePath);
};

// eslint-disable-next-line unicorn/prefer-top-level-await -- catch handler needed for demo error reporting
runDemo().catch(console.error); // eslint-disable-line no-console
