// ナレッジ自動改善ループ
// フィードバックデータからパターンを抽出し改善提案を生成する

const MIN_CORRECTIONS_FOR_PATTERN = 2;
const EMPTY = 0;

interface ImprovementProposal {
  id: string;
  description: string;
  affectedPackage: string;
  currentBehavior: string;
  proposedBehavior: string;
  evidence: string[];
  status: "proposed" | "approved" | "rejected";
}

interface TriageRecordForAnalysis {
  packageName: string;
  vulnerabilityId: string;
  impact: string;
  humanFeedback?: "approved" | "rejected" | "corrected";
  correctedImpact?: string;
}

const groupRecordsByPackage = (
  records: TriageRecordForAnalysis[],
): Map<string, TriageRecordForAnalysis[]> => {
  const groups = new Map<string, TriageRecordForAnalysis[]>();
  for (const record of records) {
    const existing = groups.get(record.packageName) ?? [];
    existing.push(record);
    groups.set(record.packageName, existing);
  }
  return groups;
};

const buildProposalForPackage = (
  pkg: string,
  corrections: TriageRecordForAnalysis[],
): ImprovementProposal => ({
  affectedPackage: pkg,
  currentBehavior: `AI triage assigns "${corrections[EMPTY].impact}" to ${pkg} vulnerabilities`,
  description: `Repeated corrections for ${pkg} suggest AI triage bias`,
  evidence: corrections.map(
    (cr) =>
      `${cr.vulnerabilityId}: AI said "${cr.impact}", human corrected to "${String(cr.correctedImpact)}"`,
  ),
  id: `improvement-${pkg}-${Date.now().toString()}`,
  proposedBehavior: `Default to "${String(corrections[EMPTY].correctedImpact)}" for ${pkg} vulnerabilities`,
  status: "proposed",
});

const analyzeForImprovements = (records: TriageRecordForAnalysis[]): ImprovementProposal[] => {
  const corrected = records.filter((rec) => rec.humanFeedback === "corrected");
  const grouped = groupRecordsByPackage(corrected);
  const proposals: ImprovementProposal[] = [];

  for (const [pkg, corrections] of grouped) {
    if (corrections.length >= MIN_CORRECTIONS_FOR_PATTERN) {
      proposals.push(buildProposalForPackage(pkg, corrections));
    }
  }
  return proposals;
};

const formatProposal = (proposal: ImprovementProposal): string =>
  [
    `--- Improvement Proposal: ${proposal.id} ---`,
    `Package: ${proposal.affectedPackage}`,
    `Issue: ${proposal.description}`,
    `Current: ${proposal.currentBehavior}`,
    `Proposed: ${proposal.proposedBehavior}`,
    `Evidence:`,
    ...proposal.evidence.map((ev) => `  - ${ev}`),
    `Status: ${proposal.status}`,
    `---`,
  ].join("\n");

export {
  analyzeForImprovements,
  formatProposal,
  type ImprovementProposal,
  type TriageRecordForAnalysis,
};
