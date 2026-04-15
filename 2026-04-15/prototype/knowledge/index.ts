/**
 * ナレッジ層 — バレルエクスポート
 */

export {
  approveProposal,
  createKnowledgeStore,
  findPatterns,
  getPendingProposals,
  recordCorrection,
  serializeState,
} from "./store.js";
export type { CorrectionRecord, KnowledgeState } from "./store.js";
export { generateImprovementReport, processFeedback } from "./improver.js";
