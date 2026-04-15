/**
 * InvoiceForge デモエントリポイント
 *
 * 三層アーキテクチャ（ハーネス / AIエージェント / 決定論的コード）を
 * 一連のパイプラインとして統合し、実際に動作するデモを提供する。
 */

/* eslint-disable import/no-nodejs-modules, no-await-in-loop, require-await, sort-imports, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment -- CLI demo */
import {
  INITIAL_PATTERNS,
  accountData,
  createRecords,
  invoices,
  saveKnowledgeState,
} from "./data-loader.js";
import {
  createKnowledgeStore,
  findPatterns,
  generateImprovementReport,
  processFeedback,
  serializeState,
} from "../knowledge/index.js";
import {
  evaluateChecklist,
  executeHook,
  getConfidenceLabel,
  requiresHumanReview,
} from "../harness/index.js";
import type { ProcessingRecord } from "../types.js";
import { classifyInvoice } from "../agent/index.js";
import { createInterface } from "node:readline";
import { validateInvoice } from "../deterministic/rules.js";

const LINE_WIDTH = 60;
const SEPARATOR = "═".repeat(LINE_WIDTH);
const THIN_SEP = "─".repeat(LINE_WIDTH);
const INCREMENT = 1;
const HUNDRED = 100;
const NO_DECIMALS = 0;

const log = (message: string): void => {
  // eslint-disable-next-line no-console -- CLI demo output
  console.log(message);
};

const askQuestion = async (
  rl: ReturnType<typeof createInterface>,
  question: string,
): Promise<string> =>
  new Promise((resolvePromise) => {
    rl.question(question, (answer) => {
      resolvePromise(answer.trim());
    });
  });

// ─── 初期化 ───

const knowledge = createKnowledgeStore(INITIAL_PATTERNS);
const processedInvoiceNumbers = new Set<string>();
const qualityCtx = {
  accountMaster: accountData.accounts,
  pastPatterns: knowledge.patterns,
  processedInvoiceNumbers,
};

/**
 * レコードに修正結果を反映する。
 */
const applyCorrection = (record: ProcessingRecord, newCode: string, accountName: string): void => {
  record.correctedAccountCode = newCode;
  record.correctedAccountName = accountName;
  record.status = "corrected";
  record.approvedAt = new Date().toISOString();
  log(`  → 修正承認: ${newCode} ${accountName}`);
};

/**
 * 科目修正の処理。修正結果をナレッジにフィードバックする。
 */
const handleCorrection = (record: ProcessingRecord, newCode: string): void => {
  const newAccount = accountData.accounts.find((acc) => acc.code === newCode);
  if (!newAccount) {
    log(`  → 科目コード '${newCode}' が見つかりません。却下扱いとします`);
    record.status = "rejected";
    return;
  }
  applyCorrection(record, newCode, newAccount.name);
  const proposal = processFeedback(record, knowledge);
  if (proposal) {
    log(`\n[ナレッジ] 改善提案を生成: ${proposal.vendor} → ${proposal.proposedAccountName}`);
  }
};

/**
 * 承認フローの入力を処理する。
 */
const markApproved = (record: ProcessingRecord): void => {
  record.status = "approved";
  record.approvedAt = new Date().toISOString();
  log("  → 承認しました");
};

const handleApproval = (record: ProcessingRecord, answer: string): void => {
  if (answer === "y") {
    markApproved(record);
    return;
  }
  if (answer === "n") {
    record.status = "rejected";
    log("  → 却下しました");
    return;
  }
  if (answer.startsWith("c:")) {
    handleCorrection(record, answer.slice("c:".length));
  }
};

/**
 * 分類結果をログ出力する。
 */
const logClassification = (record: ProcessingRecord): void => {
  const cls = record.classification;
  if (!cls) {
    return;
  }
  log(`\n[AIエージェント] 分類結果:`);
  log(`  勘定科目: ${cls.accountCode} ${cls.accountName}`);
  log(
    `  信頼度: ${(cls.confidence * HUNDRED).toFixed(NO_DECIMALS)}% (${getConfidenceLabel(cls.confidence)})`,
  );
  log(`  理由: ${cls.reasoning}`);
};

/**
 * AI分類を実行し、結果をレコードに反映する。
 */
const runClassification = (record: ProcessingRecord): void => {
  const { invoice } = record;
  const beforeResult = executeHook(
    { knowledgePatterns: knowledge.patterns, phase: "before-classify", record },
    { knowledge, qualityCtx },
  );
  if (beforeResult.injectedContext !== null && beforeResult.injectedContext !== "") {
    log(`\n[ハーネス] コンテキスト注入:\n${beforeResult.injectedContext}`);
  }
  record.classification = classifyInvoice(invoice, {
    accountMaster: accountData.accounts,
    injectedContext: beforeResult.injectedContext ?? "",
    vendorPatterns: findPatterns(knowledge, invoice.vendor),
  });
  record.status = "classified";
  record.processedAt = new Date().toISOString();
  logClassification(record);
};

/**
 * バリデーションを実行し、結果をレコードに反映する。
 */
const logValidation = (validation: {
  valid: boolean;
  issues: { severity: string; message: string }[];
}): void => {
  log(`\n[ハーネス] バリデーション: ${validation.valid ? "通過" : "不合格"}`);
  for (const issue of validation.issues) {
    const ICONS: Record<string, string> = { error: "X", warning: "!" };
    const icon = ICONS[issue.severity] ?? "i";
    log(`  [${icon}] ${issue.message}`);
  }
};

const runValidation = (record: ProcessingRecord): void => {
  const { classification, invoice } = record;
  if (!classification) {
    return;
  }
  const validation = validateInvoice({
    accountMaster: accountData.accounts,
    classification,
    invoice,
    pastPatterns: knowledge.patterns,
    processedInvoiceNumbers,
  });
  record.validation = validation;
  record.status = validation.valid ? "validated" : "rejected";
  logValidation(validation);
  processedInvoiceNumbers.add(invoice.invoiceNumber);
};

const logInvoiceHeader = (record: ProcessingRecord): void => {
  const { invoice } = record;
  log(`\n${THIN_SEP}`);
  log(`請求書: ${invoice.id} | ${invoice.vendor}`);
  log(`金額: ¥${invoice.totalAmount.toLocaleString()} | 期日: ${invoice.dueDate}`);
  log(`品目: ${invoice.items.map((item) => item.description).join(", ")}`);
};

const classifyAndValidate = (record: ProcessingRecord): void => {
  runClassification(record);
  runValidation(record);
};

/**
 * 1件の請求書を処理するパイプライン。
 */
const processInvoice = async (
  record: ProcessingRecord,
  rl: ReturnType<typeof createInterface>,
  autoApprove: boolean,
): Promise<void> => {
  logInvoiceHeader(record);
  classifyAndValidate(record);
  record.status = "pending_approval";
  if (autoApprove && !requiresHumanReview(record, knowledge.patterns)) {
    markApproved(record);
    log(`  (自動承認: 高信頼度 & 既知取引先)`);
    return;
  }
  const answer = autoApprove ? "y" : await askQuestion(rl, "  承認しますか？ (y/n/c:XXXX): ");
  handleApproval(record, answer);
};

/**
 * 処理結果のサマリーを表示する。
 */
const countByStatus = (
  records: ProcessingRecord[],
): { approved: number; corrected: number; rejected: number } => {
  let approved = 0;
  let corrected = 0;
  let rejected = 0;
  for (const rec of records) {
    if (rec.status === "approved") {
      approved += INCREMENT;
    } else if (rec.status === "corrected") {
      corrected += INCREMENT;
    } else {
      rejected += INCREMENT;
    }
  }
  return { approved, corrected, rejected };
};

const printSummary = (records: ProcessingRecord[]): void => {
  log(`\n${SEPARATOR}\n  処理結果サマリー\n${SEPARATOR}`);
  const counts = countByStatus(records);
  log(
    `  承認: ${counts.approved}件 / 修正: ${counts.corrected}件 / 却下: ${counts.rejected}件 / 合計: ${records.length}件`,
  );
};

const printChecklist = (records: ProcessingRecord[]): void => {
  log(`\n${SEPARATOR}\n  終了条件チェックリスト（ハーネスによる外部検証）\n${SEPARATOR}`);
  const evaluation = evaluateChecklist(records);
  for (const item of evaluation.checklist) {
    log(`  ${item.passed ? "[PASS]" : "[FAIL]"} ${item.description}`);
  }
  log(`\n全条件クリア: ${evaluation.allPassed ? "はい" : "いいえ"}`);
};

const printResults = (records: ProcessingRecord[]): void => {
  printChecklist(records);
  log(`\n${SEPARATOR}`);
  log(generateImprovementReport(knowledge));
  printSummary(records);
  const outputPath = saveKnowledgeState(serializeState(knowledge));
  log(`\nナレッジ状態を保存: ${outputPath}`);
  log(`\n${SEPARATOR}\n  デモ完了\n${SEPARATOR}`);
};

const printHeader = (autoApprove: boolean): void => {
  log(`${SEPARATOR}\n  InvoiceForge — AI請求書仕訳オートパイロット デモ\n${SEPARATOR}`);
  log(`\n処理対象: ${invoices.length}件 | ナレッジ: ${knowledge.patterns.length}件`);
  if (autoApprove) {
    log("モード: 自動承認");
  }
};

const main = async (): Promise<void> => {
  const autoApprove = process.argv.includes("--auto-approve");
  const records = createRecords();
  printHeader(autoApprove);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  // eslint-disable-next-line no-await-in-loop -- sequential processing required for interactive CLI
  for (const record of records) {
    await processInvoice(record, rl, autoApprove);
  }
  rl.close();
  printResults(records);
};

await main();
