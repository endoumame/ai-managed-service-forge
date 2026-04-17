/* oxlint-disable @typescript-eslint/no-unsafe-assignment -- 動的importの型推論がtsconfigなしでは不完全 */
/* oxlint-disable @typescript-eslint/no-unsafe-call -- 動的importの型推論がtsconfigなしでは不完全 */
/* oxlint-disable @typescript-eslint/no-unsafe-member-access -- 動的importの型推論がtsconfigなしでは不完全 */
/* oxlint-disable @typescript-eslint/no-unsafe-type-assertion -- 動的importの型推論がtsconfigなしでは不完全 */
/* oxlint-disable @typescript-eslint/no-unsafe-argument -- 動的importの型推論がtsconfigなしでは不完全 */
// ContractGuard デモ実行エントリポイント

import type { HookContext, StepDefinition } from "../harness/lifecycle.js";
import {
  addFeedback,
  addReviewRecord,
  createEmptyKnowledgeBase,
  saveKnowledgeBase,
} from "../knowledge/store.js";
import { analyzeContract, createAgentConfig } from "../agent/index.js";
import {
  calculateDeterministicRiskScores,
  checkRequiredClauses,
  formatReviewReport,
} from "../deterministic/rules.js";
import { formatProposals, generateImprovementProposals } from "../knowledge/improver.js";
import {
  runPipeline,
  validateInput,
  verifyClauseExistence,
  verifyScoreConsistency,
} from "../harness/lifecycle.js";
import type { AgentConfig } from "../agent/index.js";
import { CompletionPlanner } from "../harness/planner.js";
import { generateQualityReport } from "../harness/checker.js";

const KNOWLEDGE_FILE_PATH = "./knowledge-base.json";
const FEEDBACK_SCORE_ADJUSTMENT = 2;
const LAST_ELEMENT_INDEX = -1;
const BANNER_TITLE_WIDTH = 36;

// eslint-disable-next-line no-console -- CLIデモのため標準出力を使用
const log = globalThis.console.log.bind(globalThis.console);

const SAMPLE_CONTRACT = `
業務委託契約書

株式会社甲（以下「甲」という）と株式会社乙（以下「乙」という）は、以下のとおり業務委託契約を締結する。

第1条（目的）
甲は乙に対し、本契約に定める条件に従い、ソフトウェア開発業務を委託し、乙はこれを受託する。

第2条（業務内容）
乙が行う業務の内容は、別紙仕様書に定めるとおりとする。

第3条（委託料）
甲は乙に対し、本業務の対価として金500万円（消費税別）を支払うものとする。
支払期日は、納品物の検収完了後30日以内とする。

第4条（秘密保持）
甲および乙は、本契約に関連して知り得た相手方の秘密情報を、第三者に開示または漏洩してはならない。
秘密保持義務は、本契約終了後3年間存続するものとする。

第5条（知的財産権）
本業務により生じた成果物の著作権その他の知的財産権は、委託料の完済をもって甲に帰属するものとする。

第6条（損害賠償）
乙は、本契約に違反して甲に損害を与えた場合、その損害を賠償する責任を負う。

第7条（契約の解除）
甲または乙は、相手方が本契約に違反し、催告後14日以内に是正されない場合、本契約を解除することができる。

第8条（準拠法および管轄）
本契約は日本法に準拠するものとし、本契約に関する一切の紛争については東京地方裁判所を第一審の専属的合意管轄裁判所とする。

以上、本契約締結の証として、本書2通を作成し、甲乙記名押印の上、各1通を保有する。
`;

const toScoreMap = (scores: Record<string, { score: number }>): Record<string, number> => {
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(scores)) {
    result[key] = value.score;
  }
  return result;
};

// oxlint-disable-next-line require-await -- StepDefinitionのexecute型がPromiseを要求するため
const passThrough = async (ctx: HookContext): Promise<HookContext> => ctx;

// oxlint-disable-next-line require-await -- StepDefinitionのexecute型がPromiseを要求するため
const runDeterministicCheck = async (ctx: HookContext): Promise<HookContext> => {
  const scoreMap = toScoreMap(calculateDeterministicRiskScores(ctx.contractText));
  return { ...ctx, data: { ...ctx.data, deterministicRiskScores: scoreMap } };
};

const createSteps = (agentConfig: AgentConfig): StepDefinition[] => [
  {
    after: [],
    before: [validateInput],
    execute: passThrough,
    name: "入力検証",
  },
  {
    after: [verifyClauseExistence],
    before: [],
    execute: async (ctx: HookContext): Promise<HookContext> => {
      const result = await analyzeContract(ctx, agentConfig);
      return result;
    },
    name: "AI分析（条項抽出・リスク推定）",
  },
  {
    after: [verifyScoreConsistency],
    before: [],
    execute: runDeterministicCheck,
    name: "決定論的チェック（必須条項・スコア計算）",
  },
];

const verifyCompletion = (result: HookContext): void => {
  const planner = new CompletionPlanner();
  planner.addCriterion("clauses-checked", "全必須条項カテゴリが検査済み", () =>
    checkRequiredClauses(SAMPLE_CONTRACT).every((cr) => cr.found),
  );
  planner.addCriterion("risks-scored", "全リスク箇所にスコア付与済み", () => {
    const scores = result.data["aiRiskScores"];
    return typeof scores === "object" && scores !== null;
  });
  planner.addCriterion("no-errors", "エラーなし", () => !result.errors.some(Boolean));

  log(`\n${planner.formatChecklist()}`);
  log(`\n${generateQualityReport(result)}`);
};

const outputReport = (result: HookContext): void => {
  const clauseResults = checkRequiredClauses(SAMPLE_CONTRACT);
  const riskScores = calculateDeterministicRiskScores(SAMPLE_CONTRACT);
  const aiAnalysis = typeof result.data["aiAnalysis"] === "string" ? result.data["aiAnalysis"] : "";
  log(`\n${formatReviewReport(clauseResults, riskScores, aiAnalysis)}`);
};

const demoKnowledgeLoop = async (): Promise<void> => {
  log("\n\n═══ ナレッジ改善ループ デモ ═══\n");

  const riskScores = calculateDeterministicRiskScores(SAMPLE_CONTRACT);
  let kb = createEmptyKnowledgeBase();
  kb = addReviewRecord(kb, SAMPLE_CONTRACT, toScoreMap(riskScores));

  const reviewId = kb.reviews.at(LAST_ELEMENT_INDEX)?.id ?? "";
  kb = addFeedback(kb, {
    category: "秘密保持",
    comment: "秘密保持期間が3年は短い。5年以上を推奨。",
    correctedScore: FEEDBACK_SCORE_ADJUSTMENT,
    reviewId,
  });

  log("フィードバック登録: 秘密保持スコアを修正（期間が短い）");
  log(formatProposals(generateImprovementProposals(kb)));
  await saveKnowledgeBase(KNOWLEDGE_FILE_PATH, kb);
  log(`\nナレッジベースを保存: ${KNOWLEDGE_FILE_PATH}`);
};

const logBanner = (title: string): void => {
  log("╔═══════════════════════════════════════╗");
  log(`║  ${title.padEnd(BANNER_TITLE_WIDTH)}║`);
  log("╚═══════════════════════════════════════╝");
};

const runDemo = async (): Promise<void> => {
  logBanner("ContractGuard プロトタイプデモ");

  const agentConfig = createAgentConfig();
  log(`\nモード: ${agentConfig.useMock ? "モック（MOCK_AI=true）" : "Claude API"}\n`);

  const result = await runPipeline(createSteps(agentConfig), {
    contractText: SAMPLE_CONTRACT,
    data: {},
    errors: [],
    step: "",
    warnings: [],
  });

  verifyCompletion(result);
  outputReport(result);
  await demoKnowledgeLoop();
  logBanner("デモ完了");
};

try {
  await runDemo();
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`エラー: ${message}\n`);
  process.exitCode = 1;
}
