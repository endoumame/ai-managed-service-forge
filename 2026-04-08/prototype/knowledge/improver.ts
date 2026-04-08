/**
 * 自動改善ループ
 *
 * なぜこの実装か:
 * AIの提案が人間に修正されるパターンを追跡し、
 * 一定回数以上の修正が蓄積されたら改善提案を自動生成する。
 * 提案は人間が承認/却下するまでキューに保持され、
 * 承認されたものだけが知識ベースに反映される。
 */

/* eslint-disable import/no-nodejs-modules, sort-imports, typescript/no-unsafe-assignment, typescript/no-unsafe-call, typescript/strict-boolean-expressions, typescript/no-unsafe-type-assertion, typescript/no-unsafe-argument, typescript-eslint/no-unsafe-type-assertion -- Node.js I/O and JSON parsing */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { incrementCorrectionCount, recordMapping } from "./store.ts";
/* eslint-enable import/no-nodejs-modules, sort-imports */

interface CorrectionRecord {
  vendorName: string;
  itemPattern: string;
  previousCode: string;
  correctedCode: string;
  correctedName: string;
  timestamp: string;
}

interface ImprovementProposal {
  id: string;
  vendorName: string;
  itemPattern: string;
  currentCode: string;
  proposedCode: string;
  proposedName: string;
  correctionCount: number;
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
}

const CORRECTION_THRESHOLD = 3;
const PROPOSAL_ID_SLICE_START = 2;
const PROPOSAL_ID_SLICE_END = 10;
const JSON_INDENT = 2;
const HEX_RADIX = 16;

const currentDir = dirname(fileURLToPath(import.meta.url));
const queuePath = resolve(currentDir, "../data/improvement-queue.json");

const readQueue = (): ImprovementProposal[] => {
  if (!existsSync(queuePath)) {
    return [];
  }
  const raw = readFileSync(queuePath, "utf8");
  return JSON.parse(raw) as ImprovementProposal[];
};

const writeQueue = (queue: ImprovementProposal[]): void => {
  const json = JSON.stringify(queue, null, JSON_INDENT);
  writeFileSync(queuePath, `${json}\n`, "utf8");
};

const generateProposalId = (): string => {
  const hex = Math.random()
    .toString(HEX_RADIX)
    .slice(PROPOSAL_ID_SLICE_START, PROPOSAL_ID_SLICE_END);
  return `prop_${hex}`;
};

const hasPendingProposal = (vendorName: string, itemPattern: string): boolean => {
  const queue = readQueue();
  return queue.some(
    (pr) =>
      pr.vendorName === vendorName && pr.itemPattern === itemPattern && pr.status === "pending",
  );
};

const buildProposal = (correction: CorrectionRecord, count: number): ImprovementProposal => ({
  correctionCount: count,
  createdAt: new Date().toISOString(),
  currentCode: correction.previousCode,
  id: generateProposalId(),
  itemPattern: correction.itemPattern,
  proposedCode: correction.correctedCode,
  proposedName: correction.correctedName,
  status: "pending",
  vendorName: correction.vendorName,
});

const trackCorrection = (correction: CorrectionRecord): ImprovementProposal | null => {
  const count = incrementCorrectionCount(correction.vendorName, correction.itemPattern);
  if (count < CORRECTION_THRESHOLD) {
    return null;
  }
  if (hasPendingProposal(correction.vendorName, correction.itemPattern)) {
    return null;
  }
  const proposal = buildProposal(correction, count);
  const queue = readQueue();
  queue.push(proposal);
  writeQueue(queue);
  return proposal;
};

const acceptProposal = (proposalId: string): boolean => {
  const queue = readQueue();
  const proposal = queue.find((pr) => pr.id === proposalId && pr.status === "pending");
  if (!proposal) {
    return false;
  }
  proposal.status = "accepted";
  writeQueue(queue);
  recordMapping({
    accountCode: proposal.proposedCode,
    accountName: proposal.proposedName,
    itemPattern: proposal.itemPattern,
    vendorName: proposal.vendorName,
  });
  return true;
};

const rejectProposal = (proposalId: string): boolean => {
  const queue = readQueue();
  const proposal = queue.find((pr) => pr.id === proposalId && pr.status === "pending");
  if (!proposal) {
    return false;
  }
  proposal.status = "rejected";
  writeQueue(queue);
  return true;
};

const getPendingProposals = (): ImprovementProposal[] => {
  const queue = readQueue();
  return queue.filter((pr) => pr.status === "pending");
};

const formatProposal = (proposal: ImprovementProposal): string => {
  const lines = [
    `[提案 ${proposal.id}]`,
    `  取引先: ${proposal.vendorName}`,
    `  品目パターン: ${proposal.itemPattern}`,
    `  現在の勘定科目: ${proposal.currentCode}`,
    `  提案する勘定科目: ${proposal.proposedCode} (${proposal.proposedName})`,
    `  修正回数: ${proposal.correctionCount}回`,
    `  状態: ${proposal.status}`,
  ];
  return lines.join("\n");
};

export { acceptProposal, formatProposal, getPendingProposals, rejectProposal, trackCorrection };
export type { CorrectionRecord, ImprovementProposal };
