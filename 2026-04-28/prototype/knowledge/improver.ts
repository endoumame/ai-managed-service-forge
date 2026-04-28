import type { CorrectionRecord, ImprovementProposal } from "../types.ts";
import { addCorrection, addImprovement, findVendor, getCorrections } from "./store.ts";

const IMPROVEMENT_THRESHOLD = 2;
const LAST_ELEMENT = -1;
const RADIX_36 = 36;

const generateProposalId = (): string => `imp-${Date.now().toString(RADIX_36)}`;

const lastCorrection = (corrections: CorrectionRecord[]): CorrectionRecord =>
  corrections.at(LAST_ELEMENT);

const groupCorrectionsByVendor = (
  corrections: CorrectionRecord[],
): Map<string, CorrectionRecord[]> => {
  const grouped = new Map<string, CorrectionRecord[]>();
  for (const correction of corrections) {
    const existing = grouped.get(correction.vendorName) ?? [];
    existing.push(correction);
    grouped.set(correction.vendorName, existing);
  }
  return grouped;
};

const proposeNewVendorMapping = (
  vendorName: string,
  corrections: CorrectionRecord[],
): ImprovementProposal => {
  const latest = lastCorrection(corrections);
  return {
    basedOn: corrections,
    createdAt: new Date().toLocaleDateString("sv-SE"),
    description: `新規取引先「${vendorName}」のデフォルト勘定科目を「${latest.correctedAccountName}」(${latest.correctedAccountCode}) に設定`,
    id: generateProposalId(),
    proposedChange: {
      aliases: [] as string[],
      defaultAccountCode: latest.correctedAccountCode,
      defaultAccountName: latest.correctedAccountName,
      vendorName,
    },
    status: "draft",
    type: "add_vendor_mapping",
  };
};

const proposeAccountUpdate = (
  vendorName: string,
  corrections: CorrectionRecord[],
): ImprovementProposal => {
  const latest = lastCorrection(corrections);
  return {
    basedOn: corrections,
    createdAt: new Date().toLocaleDateString("sv-SE"),
    description: `取引先「${vendorName}」のデフォルト勘定科目を「${latest.correctedAccountName}」(${latest.correctedAccountCode}) に変更（${String(corrections.length)}回の修正に基づく）`,
    id: generateProposalId(),
    proposedChange: {
      accountCode: latest.correctedAccountCode,
      accountName: latest.correctedAccountName,
      vendorName,
    },
    status: "draft",
    type: "update_default_account",
  };
};

const buildProposal = (
  vendorName: string,
  vendorCorrections: CorrectionRecord[],
): ImprovementProposal => {
  const existingVendor = findVendor(vendorName);
  return existingVendor === null
    ? proposeNewVendorMapping(vendorName, vendorCorrections)
    : proposeAccountUpdate(vendorName, vendorCorrections);
};

const analyzeCorrections = (): ImprovementProposal[] => {
  const grouped = groupCorrectionsByVendor(getCorrections());
  const proposals: ImprovementProposal[] = [];

  for (const [vendorName, vendorCorrections] of grouped) {
    if (vendorCorrections.length >= IMPROVEMENT_THRESHOLD) {
      const proposal = buildProposal(vendorName, vendorCorrections);
      addImprovement(proposal);
      proposals.push(proposal);
    }
  }

  return proposals;
};

const recordCorrectionAndAnalyze = (correction: CorrectionRecord): ImprovementProposal[] => {
  addCorrection(correction);
  return analyzeCorrections();
};

export { analyzeCorrections, recordCorrectionAndAnalyze };
