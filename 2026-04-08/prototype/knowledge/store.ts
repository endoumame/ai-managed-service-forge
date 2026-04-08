/**
 * 知識ストレージレイヤー
 *
 * なぜこの実装か:
 * AIの提案精度を継続的に改善するため、過去の仕訳パターンを蓄積する。
 * JSONファイルベースのシンプルな永続化で、プロトタイプとして
 * 外部DBなしに動作可能にする。
 */

/* eslint-disable import/no-nodejs-modules, sort-imports, typescript/no-unsafe-assignment, typescript/no-unsafe-call, typescript/strict-boolean-expressions, typescript/no-unsafe-type-assertion, typescript/no-unsafe-argument -- Node.js built-in modules and JSON parsing */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
/* eslint-enable import/no-nodejs-modules, sort-imports */

interface VendorMapping {
  vendorName: string;
  itemPattern: string;
  accountCode: string;
  accountName: string;
  correctionCount: number;
  lastUsed: string;
}

interface KnowledgeBase {
  vendorMappings: VendorMapping[];
}

interface LookupResult {
  found: boolean;
  mapping: VendorMapping | null;
}

interface MappingInput {
  vendorName: string;
  itemPattern: string;
  accountCode: string;
  accountName: string;
}

const INITIAL_CORRECTION_COUNT = 0;
const NOT_FOUND_INDEX = -1;
const JSON_INDENT = 2;
const INCREMENT = 1;

const currentDir = dirname(fileURLToPath(import.meta.url));
const knowledgeBasePath = resolve(currentDir, "../data/knowledge-base.json");

const createEmptyKnowledgeBase = (): KnowledgeBase => ({
  vendorMappings: [],
});

const readKnowledgeBase = (): KnowledgeBase => {
  if (!existsSync(knowledgeBasePath)) {
    return createEmptyKnowledgeBase();
  }
  const raw = readFileSync(knowledgeBasePath, "utf8");
  return JSON.parse(raw) as KnowledgeBase;
};

const writeKnowledgeBase = (kb: KnowledgeBase): void => {
  const json = JSON.stringify(kb, null, JSON_INDENT);
  writeFileSync(knowledgeBasePath, `${json}\n`, "utf8");
};

const lookupPattern = (vendorName: string, itemName: string): LookupResult => {
  const kb = readKnowledgeBase();
  const mapping = kb.vendorMappings.find(
    (vm) => vm.vendorName === vendorName && itemName.includes(vm.itemPattern),
  );
  if (mapping) {
    return { found: true, mapping };
  }
  return { found: false, mapping: null };
};

const buildNewMapping = (input: MappingInput): VendorMapping => ({
  accountCode: input.accountCode,
  accountName: input.accountName,
  correctionCount: INITIAL_CORRECTION_COUNT,
  itemPattern: input.itemPattern,
  lastUsed: new Date().toISOString(),
  vendorName: input.vendorName,
});

const updateExistingMapping = (existing: VendorMapping, input: MappingInput): void => {
  existing.accountCode = input.accountCode;
  existing.accountName = input.accountName;
  existing.lastUsed = new Date().toISOString();
};

const recordMapping = (input: MappingInput): void => {
  const kb = readKnowledgeBase();
  const existingIndex = kb.vendorMappings.findIndex(
    (vm) => vm.vendorName === input.vendorName && vm.itemPattern === input.itemPattern,
  );
  if (existingIndex === NOT_FOUND_INDEX) {
    kb.vendorMappings.push(buildNewMapping(input));
  } else {
    const existing = kb.vendorMappings[existingIndex];
    if (existing) {
      updateExistingMapping(existing, input);
    }
  }
  writeKnowledgeBase(kb);
};

const incrementCorrectionCount = (vendorName: string, itemPattern: string): number => {
  const kb = readKnowledgeBase();
  const mapping = kb.vendorMappings.find(
    (vm) => vm.vendorName === vendorName && vm.itemPattern === itemPattern,
  );
  if (!mapping) {
    return INITIAL_CORRECTION_COUNT;
  }
  mapping.correctionCount += INCREMENT;
  writeKnowledgeBase(kb);
  return mapping.correctionCount;
};

const getAllMappings = (): VendorMapping[] => {
  const kb = readKnowledgeBase();
  return kb.vendorMappings;
};

export {
  getAllMappings,
  incrementCorrectionCount,
  lookupPattern,
  readKnowledgeBase,
  recordMapping,
  writeKnowledgeBase,
};
export type { KnowledgeBase, LookupResult, VendorMapping };
