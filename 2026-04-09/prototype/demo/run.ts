/**
 * InvoicePilot デモ実行エントリポイント
 *
 * AIマネージドサービスの三層構造（ハーネス / AIエージェント / 決定論的コード）を
 * 請求書処理のパイプラインとしてデモする。
 *
 * 実行方法:
 *   pnpm demo        -- モックAIで実行
 *   pnpm demo:mock   -- 明示的にモックモードで実行
 */

import type { HumanReviewHandler, PlannerDeps } from "../harness/planner.ts";
import type {
  HumanReviewRequest,
  KnowledgeEntry,
  ProcessingResult,
  RawInvoiceInput,
} from "../types.ts";
import { applyImprovement, proposeImprovements } from "../knowledge/improver.ts";
import { PipelinePlanner } from "../harness/planner.ts";
import { createAgent } from "../agent/index.ts";
import { createDefaultLifecycleManager } from "../harness/lifecycle.ts";
import { createDeterministic } from "../deterministic/rules.ts";
import { createEmptyKnowledge } from "../knowledge/store.ts";
import { log } from "../logger.ts";

/** デモ用のヒューマンレビューハンドラ（CLIで自動承認をシミュレート） */
const createDemoReviewHandler = (): HumanReviewHandler => ({
  // oxlint-disable-next-line require-await
  requestReview: async (request: HumanReviewRequest): Promise<string> => {
    log(`\n[Human Review] ${request.message}`);
    if (request.options) {
      log(`  選択肢: ${request.options.join(" / ")}`);
    }
    const FIRST_OPTION = 0;
    const response = request.defaultValue ?? request.options?.[FIRST_OPTION] ?? "OK";
    log(`  → 自動応答 (デモ): "${response}"`);
    return response;
  },
});

/** サンプル請求書データ */
const sampleInvoices: RawInvoiceInput[] = [
  {
    sourceId: "invoice-001.pdf",
    structured: {
      confidence: 0.92,
      currency: "JPY",
      dueDate: "2026-05-31",
      invoiceDate: "2026-04-01",
      invoiceNumber: "INV-2026-0042",
      lineItems: [
        {
          amount: 150_000,
          description: "Webアプリケーション開発 4月分",
          quantity: 1,
          taxCategory: "standard",
          unitPrice: 150_000,
        },
        {
          amount: 50_000,
          description: "サーバー保守・運用費",
          quantity: 1,
          taxCategory: "standard",
          unitPrice: 50_000,
        },
      ],
      subtotal: 200_000,
      taxAmount: 20_000,
      totalAmount: 220_000,
      vendorName: "株式会社テックパートナーズ",
    },
  },
  {
    sourceId: "invoice-002.pdf",
    structured: {
      confidence: 0.88,
      currency: "JPY",
      dueDate: "2026-05-15",
      invoiceDate: "2026-04-05",
      invoiceNumber: "INV-2026-0043",
      lineItems: [
        {
          amount: 30_000,
          description: "クラウドストレージ利用料 4月分",
          quantity: 1,
          taxCategory: "standard",
          unitPrice: 30_000,
        },
      ],
      subtotal: 30_000,
      taxAmount: 3000,
      totalAmount: 33_000,
      vendorName: "クラウドサービス株式会社",
    },
  },
];

/** 区切り線の文字数 */
const SEPARATOR_WIDTH = 60;

/** 仕訳結果を表示する */
const logJournalEntry = (result: ProcessingResult): void => {
  log("\n[Result] 生成された仕訳データ:");
  log(`  日付: ${result.journalEntry.date}`);
  log(
    `  借方: ${result.journalEntry.debitAccount}  ¥${result.journalEntry.debitAmount.toLocaleString()}`,
  );
  log(
    `  貸方: ${result.journalEntry.creditAccount}  ¥${result.journalEntry.creditAmount.toLocaleString()}`,
  );
  log(`  摘要: ${result.journalEntry.description}`);
  log("");
};

/** ナレッジサマリーを表示する */
const logKnowledgeSummary = (knowledge: KnowledgeEntry): void => {
  log(`\n[Summary] ナレッジストアの状態:`);
  log(`  学習済み取引先数: ${knowledge.accountMappings.length}`);
  log(`  処理済み請求書数: ${knowledge.processedInvoices.length}`);
  for (const mapping of knowledge.accountMappings) {
    log(`  - ${mapping.vendorName} → ${mapping.accountName} (${mapping.usageCount}回使用)`);
  }
};

/** ヘッダーを表示する */
const logHeader = (useMock: boolean): void => {
  log("=".repeat(SEPARATOR_WIDTH));
  log("InvoicePilot -- AIマネージドサービス プロトタイプデモ");
  log("=".repeat(SEPARATOR_WIDTH));
  log("\n三層構造: ハーネス / AIエージェント / 決定論的コード\n");
  log(`モード: ${useMock ? "モックAI" : "Claude API"}\n`);
};

/** パイプラインの依存関係を構築する */
const createDeps = (useMock: boolean): PlannerDeps => ({
  agent: createAgent(useMock),
  deterministic: createDeterministic(),
  humanReview: createDemoReviewHandler(),
  knowledge: createEmptyKnowledge(),
  lifecycle: createDefaultLifecycleManager(),
});

/** 単一の請求書を処理し、更新されたナレッジを返す */
const processSingleInvoice = async (
  invoice: RawInvoiceInput,
  deps: PlannerDeps,
): Promise<KnowledgeEntry> => {
  log("-".repeat(SEPARATOR_WIDTH));
  log(`処理開始: ${invoice.sourceId}`);
  log("-".repeat(SEPARATOR_WIDTH));
  const result = await new PipelinePlanner(deps).process(invoice);
  for (const proposal of proposeImprovements(result)) {
    log(`  ${proposal}`);
  }
  logJournalEntry(result);
  return applyImprovement(deps.knowledge, result.extracted, result.classification);
};

/** 全請求書を順次処理する */
const processAllInvoices = async (deps: PlannerDeps): Promise<KnowledgeEntry> => {
  let { knowledge } = deps;
  for (const invoice of sampleInvoices) {
    // oxlint-disable-next-line no-await-in-loop -- intentionally sequential: each invoice updates knowledge for the next
    knowledge = await processSingleInvoice(invoice, { ...deps, knowledge });
  }
  return knowledge;
};

/** デモのメイン実行関数 */
const runDemo = async (): Promise<void> => {
  const useMock = true;
  logHeader(useMock);
  const deps = createDeps(useMock);
  const knowledge = await processAllInvoices(deps);
  log("=".repeat(SEPARATOR_WIDTH));
  log("デモ完了");
  log("=".repeat(SEPARATOR_WIDTH));
  logKnowledgeSummary(knowledge);
};

try {
  await runDemo();
} catch (error: unknown) {
  log(`[Error] ${error instanceof Error ? error.message : String(error)}`);
  log("[Error] プロセスを終了します");
}
