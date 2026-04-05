/**
 * Knowledge/store.ts — ナレッジストレージ
 *
 * なぜこの実装か:
 * ナレッジベースをインメモリで管理する（プロトタイプ用）。
 * 取引先→勘定科目のマッピングを蓄積し、時間とともに精度を向上させる。
 * これがAIマネージドサービスの自己改善ループの核心部分。
 * 本番ではDB永続化に差し替える。
 */

import type { ImprovementProposal, VendorMapping } from "../types.ts";

const ZERO = 0;
const ONE = 1;
const JSON_INDENT = 2;

interface KnowledgeData {
  mappings: VendorMapping[];
  proposals: ImprovementProposal[];
}

const createEmptyData = (): KnowledgeData => ({
  mappings: [],
  proposals: [],
});

class KnowledgeStore {
  private data: KnowledgeData;

  constructor(initialData?: KnowledgeData) {
    this.data = initialData ?? createEmptyData();
  }

  /** 初期マッピングデータを一括ロード */
  static fromMappings(mappings: VendorMapping[]): KnowledgeStore {
    return new KnowledgeStore({ mappings, proposals: [] });
  }

  /** JSONシリアライズ用（永続化の接点） */
  toJSON(): string {
    return JSON.stringify(this.data, null, JSON_INDENT);
  }

  /** 取引先マッピングを取得 */
  getMappings(): VendorMapping[] {
    return [...this.data.mappings];
  }

  /** 特定の取引先のマッピングを検索 */
  findMapping(vendorName: string): VendorMapping | null {
    return this.data.mappings.find((mp) => mp.vendorName === vendorName) ?? null;
  }

  /** マッピングを追加または更新 */
  upsertMapping(mapping: VendorMapping): void {
    const idx = this.data.mappings.findIndex((mp) => mp.vendorName === mapping.vendorName);
    if (idx >= ZERO) {
      this.data.mappings[idx] = mapping;
    } else {
      this.data.mappings.push(mapping);
    }
  }

  /** 改善提案を追加 */
  addProposal(proposal: ImprovementProposal): void {
    this.data.proposals.push(proposal);
  }

  /** 保留中の改善提案を取得 */
  getPendingProposals(): ImprovementProposal[] {
    return this.data.proposals.filter((pr) => pr.status === "pending");
  }

  /**
   * 改善提案を承認し、マッピングに反映する
   * これがヒューマン・イン・ザ・ループの接点
   */
  approveProposal(proposalId: string): boolean {
    const proposal = this.data.proposals.find((pr) => pr.id === proposalId);
    if (typeof proposal !== "object" || proposal === null) {
      return false;
    }
    if (proposal.status !== "pending") {
      return false;
    }
    proposal.status = "approved";
    this.upsertMapping(proposal.proposedRule);
    return true;
  }

  /** 改善提案を却下 */
  rejectProposal(proposalId: string): boolean {
    const proposal = this.data.proposals.find((pr) => pr.id === proposalId);
    if (typeof proposal !== "object" || proposal === null) {
      return false;
    }
    if (proposal.status !== "pending") {
      return false;
    }
    proposal.status = "rejected";
    return true;
  }

  /** マッピングの使用回数をインクリメント */
  recordUsage(vendorName: string): void {
    const mapping = this.data.mappings.find((mp) => mp.vendorName === vendorName);
    if (typeof mapping === "object" && mapping !== null) {
      mapping.usageCount += ONE;
      mapping.lastUsed = new Date().toISOString();
    }
  }
}

export { KnowledgeStore };
export type { KnowledgeData };
