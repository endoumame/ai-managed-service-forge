import type { ExtractedData, JournalEntry } from "../types.ts";

const CONFIDENCE_THRESHOLD = 0.8;
const ANOMALY_MULTIPLIER = 2;
const SUM_INITIAL = 0;

interface QualityReport {
  needsHumanReview: boolean;
  reasons: string[];
}

const checkExtractionQuality = (extracted: ExtractedData): QualityReport => {
  const reasons: string[] = [];
  if (extracted.confidence < CONFIDENCE_THRESHOLD) {
    reasons.push(`抽出信頼度が低い: ${extracted.confidence} (閾値: ${CONFIDENCE_THRESHOLD})`);
  }
  return { needsHumanReview: reasons.length > SUM_INITIAL, reasons };
};

const checkJournalQuality = (entry: JournalEntry): QualityReport => {
  const reasons: string[] = [];
  if (entry.confidence < CONFIDENCE_THRESHOLD) {
    reasons.push(`仕訳信頼度が低い: ${entry.confidence} (閾値: ${CONFIDENCE_THRESHOLD})`);
  }
  return { needsHumanReview: reasons.length > SUM_INITIAL, reasons };
};

const checkAmountAnomaly = (amount: number, vendorHistory: number[]): QualityReport => {
  const reasons: string[] = [];
  if (vendorHistory.length === SUM_INITIAL) {
    reasons.push("新規取引先のため過去データなし — 人間の確認を推奨");
    return { needsHumanReview: true, reasons };
  }
  const avg = vendorHistory.reduce((sum, val) => sum + val, SUM_INITIAL) / vendorHistory.length;
  if (amount > avg * ANOMALY_MULTIPLIER) {
    reasons.push(`金額 ${amount} が過去平均 ${Math.round(avg)} の ${ANOMALY_MULTIPLIER}倍を超過`);
  }
  return { needsHumanReview: reasons.length > SUM_INITIAL, reasons };
};

export type { QualityReport };
export {
  CONFIDENCE_THRESHOLD,
  ANOMALY_MULTIPLIER,
  checkExtractionQuality,
  checkJournalQuality,
  checkAmountAnomaly,
};
