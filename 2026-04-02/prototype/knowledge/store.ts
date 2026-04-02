/**
 * ナレッジストア: 取引先×品目→勘定科目のマッピングを管理
 *
 * なぜインメモリか:
 * Node.js組み込みモジュールに依存せず、純粋なデータ操作のみ行う。
 * 永続化（ファイルI/O）はデモのエントリポイントに委譲する。
 * これにより、テスト容易性が高まり、本番でのDB差し替えも容易になる。
 *
 * なぜナレッジ層が独立しているか:
 * AIエージェントの推定結果をそのまま使うのではなく、
 * ユーザーのフィードバックで「検証済み」のマッピングだけをナレッジに格納する。
 * これにより、AIのハルシネーションがナレッジを汚染するのを防ぐ。
 */

import type { KnowledgeEntry } from "../harness/types.js";

const FIRST_MATCH_INDEX = 0;
const CONFIDENCE_INCREMENT = 0.1;
const MAX_CONFIDENCE = 1;
const INITIAL_CONFIDENCE = 0.7;

/** インメモリのナレッジストア */
class KnowledgeStore {
  private entries: KnowledgeEntry[];

  constructor(initial: KnowledgeEntry[] = []) {
    this.entries = [...initial];
  }

  getAll(): KnowledgeEntry[] {
    return [...this.entries];
  }

  /**
   * 取引先と品目パターンから、最も確信度の高いマッピングを検索する
   */
  findMapping(vendor: string, itemDescription: string): KnowledgeEntry | null {
    const lowerDesc = itemDescription.toLowerCase();

    const exactMatch = this.entries.find(
      (entry) => entry.vendor === vendor && entry.itemPattern.toLowerCase() === lowerDesc,
    );
    if (exactMatch) {
      return exactMatch;
    }

    const partialMatches = this.entries
      .filter(
        (entry) => entry.vendor === vendor && lowerDesc.includes(entry.itemPattern.toLowerCase()),
      )
      .toSorted((aa, bb) => bb.confidence - aa.confidence);

    return partialMatches[FIRST_MATCH_INDEX] ?? null;
  }

  /**
   * マッピングを追加または更新する
   * ユーザーの承認を経た場合のみ呼ばれる
   */
  upsertMapping(mapping: {
    vendor: string;
    itemPattern: string;
    accountCode: string;
    accountName: string;
  }): void {
    const existing = this.entries.find(
      (entry) => entry.vendor === mapping.vendor && entry.itemPattern === mapping.itemPattern,
    );

    if (existing) {
      existing.accountCode = mapping.accountCode;
      existing.accountName = mapping.accountName;
      existing.confidence = Math.min(existing.confidence + CONFIDENCE_INCREMENT, MAX_CONFIDENCE);
      existing.usageCount += 1;
      existing.lastUsed = new Date().toISOString();
    } else {
      this.entries.push({
        ...mapping,
        confidence: INITIAL_CONFIDENCE,
        lastUsed: new Date().toISOString(),
        usageCount: 1,
      });
    }
  }
}

export { KnowledgeStore };
