/**
 * ハーネス層 — ライフサイクルフック定義
 *
 * なぜこの実装か:
 * AIエージェントの処理前後にフックを挟むことで、
 * コンテキスト注入（before）と品質検証（after）を自動化する。
 * エージェントのコードを変更せずに、ハーネス側で振る舞いを制御できる。
 * これが「シェフ（AI）と調理場（ハーネス）の分離」の実装。
 */

import type { HookContext, HookResult, ProcessingRecord } from "../types.js";
import type { KnowledgeState } from "../knowledge/store.js";
import type { QualityCheckContext } from "./checker.js";
import { checkClassificationQuality } from "./checker.js";
import { findPatterns } from "../knowledge/store.js";

const EMPTY = 0;

/**
 * Before-classify フック
 * AI分類の前に実行される。過去の仕訳パターンをコンテキストとして注入し、
 * AIがより精度の高い分類を行えるようにする。
 */
const beforeClassify = (record: ProcessingRecord, knowledge: KnowledgeState): HookResult => {
  const patterns = findPatterns(knowledge, record.invoice.vendor);
  const hasHistory = patterns.length > EMPTY;

  if (!hasHistory) {
    return {
      injectedContext: `取引先「${record.invoice.vendor}」は新規取引先です。過去の仕訳パターンはありません。`,
      proceed: true,
    };
  }

  const contextLines = [`取引先「${record.invoice.vendor}」の過去の仕訳パターン:`];
  for (const pat of patterns) {
    contextLines.push(
      `  - ${pat.itemKeyword} → ${pat.accountCode} ${pat.accountName} (${pat.frequency}回使用)`,
    );
  }

  return {
    injectedContext: contextLines.join("\n"),
    proceed: true,
  };
};

/**
 * After-classify フック
 * AI分類の後に実行される。決定論的バリデーションで品質チェックを行い、
 * 基準を満たさない場合は処理を中断する。
 */
const afterClassify = (record: ProcessingRecord, qualityCtx: QualityCheckContext): HookResult => {
  const validation = checkClassificationQuality(record, qualityCtx);
  const updatedRecord: ProcessingRecord = {
    ...record,
    status: validation.valid ? "validated" : "rejected",
    validation,
  };

  return {
    issues: validation.issues,
    modifiedRecord: updatedRecord,
    proceed: validation.valid,
  };
};

/**
 * 全フックを順次実行するオーケストレーター。
 * フェーズに応じて適切なフックを呼び出す。
 */
const executeHook = (context: HookContext, deps: HookDependencies): HookResult => {
  if (context.phase === "before-classify") {
    return beforeClassify(context.record, deps.knowledge);
  }

  if (context.phase === "after-classify") {
    return afterClassify(context.record, deps.qualityCtx);
  }

  // On-approval, on-complete は将来実装
  return { proceed: true };
};

interface HookDependencies {
  knowledge: KnowledgeState;
  qualityCtx: QualityCheckContext;
}

export { executeHook };
export type { HookDependencies };
