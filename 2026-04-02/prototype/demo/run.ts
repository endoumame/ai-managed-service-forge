/**
 * デモ用エントリポイント
 *
 * 実行方法: npx tsx demo/run.ts
 * ANTHROPIC_API_KEYが設定されていない場合はデモモードで動作する
 */

/* eslint-disable no-console -- CLIアプリケーション */
/* eslint-disable import/no-nodejs-modules -- デモ層はNode.js環境前提 */
/* eslint-disable sort-imports -- eslint-disableブロック対策 */
/* eslint-disable no-magic-numbers -- デモデータのリテラル値 */
/* eslint-disable no-undefined -- process.envの型がstring|undefinedのため */
/* eslint-disable require-await -- フォーマッタがasyncを付与する */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import Anthropic from "@anthropic-ai/sdk";
import type { AiCallFn } from "../agent/index.js";
import { KnowledgeStore } from "../knowledge/store.js";
import { printHeader, printJournalEntries } from "./ui.js";
import { runAiSteps, runValidationAndApproval } from "./pipeline.js";
import type { PipelineInput } from "./pipeline.js";
import { SAMPLE_ENTRIES, SAMPLE_INVOICE } from "./sample-data.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const KNOWLEDGE_FILE = join(DATA_DIR, "knowledge.json");
const SAMPLE_INVOICE_FILE = join(DATA_DIR, "sample-invoice.txt");
const MODEL_ID = "claude-sonnet-4-20250514";
const MAX_TOKENS = 4096;
const DEMO_CONFIDENCE = 0.5;
const PERCENTAGE = 100;
const DECIMAL_PLACES = 1;

const loadStore = (): KnowledgeStore => {
  if (!existsSync(KNOWLEDGE_FILE)) {
    return new KnowledgeStore();
  }
  const raw = readFileSync(KNOWLEDGE_FILE, "utf8");
  // eslint-disable-next-line typescript-eslint/no-unsafe-argument -- JSONデシリアライズ境界
  return new KnowledgeStore(JSON.parse(raw));
};

const saveStore = (store: KnowledgeStore): void => {
  writeFileSync(KNOWLEDGE_FILE, JSON.stringify(store.getAll(), null, 2), "utf8");
};

const createAiCaller =
  (client: Anthropic): AiCallFn =>
  async (prompt: string): Promise<string> => {
    const response = await client.messages.create({
      max_tokens: MAX_TOKENS,
      messages: [{ content: prompt, role: "user" }],
      model: MODEL_ID,
    });
    let text = "";
    for (const block of response.content) {
      if (block.type === "text") {
        text += block.text;
      }
    }
    return text;
  };

/** デモモード: Step 1-2をハードコードデータで表示 */
const showDemoSteps = (input: PipelineInput): void => {
  printHeader("Step 1: 請求書データ（デモ用ハードコード）");
  console.log(`  取引先: ${input.invoice.vendor ?? "不明"}`);
  console.log(`  合計金額: ${input.invoice.totalAmount?.toLocaleString() ?? "不明"}円`);
  console.log(`  品目数: ${input.invoice.lineItems.length}件\n`);
  printHeader("Step 2: 仕訳推定結果（デモ用）");
  console.log(`  確信度: ${(input.confidence * PERCENTAGE).toFixed(DECIMAL_PLACES)}%\n`);
  printJournalEntries(input.entries);
};

/** パイプライン入力を構築する（API or デモ） */
const resolveInput = async (invoiceText: string, store: KnowledgeStore): Promise<PipelineInput> => {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (apiKey !== undefined && apiKey !== "") {
    const client = new Anthropic({ apiKey });
    return runAiSteps(createAiCaller(client), invoiceText, store);
  }
  console.log("ANTHROPIC_API_KEY 未設定 → デモモードで起動します。\n");
  const input: PipelineInput = {
    confidence: DEMO_CONFIDENCE,
    entries: SAMPLE_ENTRIES,
    invoice: SAMPLE_INVOICE,
    store,
  };
  showDemoSteps(input);
  return input;
};

const main = async (): Promise<void> => {
  console.log("");
  printHeader("InvoicePilot - 請求書処理パイプライン デモ");
  const invoiceText = readFileSync(SAMPLE_INVOICE_FILE, "utf8");
  console.log("請求書テキスト:");
  console.log(invoiceText);

  const store = loadStore();
  const input = await resolveInput(invoiceText, store);
  await runValidationAndApproval(input);
  saveStore(store);
  printHeader("処理完了");
};

await main();
