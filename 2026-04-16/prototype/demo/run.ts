// DepShield デモエントリポイント
// ハーネス→決定論的スキャン→AIトリアージ→ナレッジ改善の全パイプラインを実行する

/* eslint-disable no-console, sort-imports */

import { addHumanFeedback, addTriageRecord, createEmptyKnowledgeBase } from "../knowledge/store.js";
import type { KnowledgeBase } from "../knowledge/store.js";
import { analyzeForImprovements, formatProposal } from "../knowledge/improver.js";
import {
  analyzeReachability,
  parseDependencies,
  scanForVulnerabilities,
} from "../deterministic/rules.js";
import type { Vulnerability } from "../deterministic/rules.js";
import { createScanPlanner, createTriagePlanner } from "../harness/planner.js";
import { executeHooks, registerDefaultHooks } from "../harness/lifecycle.js";
import { checkTriageQuality } from "../harness/checker.js";
import { triageVulnerability } from "../agent/index.js";
import type { TriageInput, TriageOutput } from "../agent/index.js";

const LINE_WIDTH = 60;
const HALF_LINE_WIDTH = 40;
const SEPARATOR = "=".repeat(LINE_WIDTH);
const HALF_SEP = "-".repeat(HALF_LINE_WIDTH);
const EMPTY = 0;

const DEMO_PACKAGE_JSON = {
  dependencies: {
    axios: "0.21.0",
    express: "4.17.0",
    jsonwebtoken: "8.5.0",
    lodash: "4.17.20",
  },
  devDependencies: {
    minimist: "1.2.5",
  },
};

const printHeader = (title: string): void => {
  console.log(`\n${SEPARATOR}`);
  console.log(`  ${title}`);
  console.log(SEPARATOR);
};

const printVulnerability = (vuln: Vulnerability): void => {
  const reachLabel = vuln.reachable ? "YES" : "NO";
  console.log(`  [${vuln.severity}] ${vuln.id}: ${vuln.title}`);
  console.log(
    `    Package: ${vuln.packageName} | Fix: ${String(vuln.fixedVersion)} | Reachable: ${reachLabel}`,
  );
};

const printTriageResult = (result: TriageOutput): void => {
  const reviewLabel = result.requiresHumanReview ? " [HUMAN REVIEW REQUIRED]" : "";
  console.log(`\n  ${HALF_SEP}`);
  console.log(`  ${result.packageName} (${result.vulnerability})`);
  console.log(
    `    Impact: ${result.impact} | Confidence: ${String(result.confidence)}${reviewLabel}`,
  );
  console.log(`    Reasoning: ${result.reasoning}`);
};

const scanDependencies = (): Vulnerability[] => {
  const deps = parseDependencies(DEMO_PACKAGE_JSON);
  console.log(`\n  Found ${String(deps.length)} dependencies`);
  const vulns = scanForVulnerabilities(deps);
  return analyzeReachability(vulns);
};

const verifyScanCompletion = (vulns: Vulnerability[]): void => {
  const deps = parseDependencies(DEMO_PACKAGE_JSON);
  const names = deps.map((dep) => dep.name);
  const scanPlanner = createScanPlanner({
    scannedPackages: names,
    totalPackages: names,
    vulnerabilities: vulns,
  });
  console.log(scanPlanner.formatStatus());
};

const printScanResults = (vulns: Vulnerability[]): void => {
  console.log(`\n  Vulnerabilities found: ${String(vulns.length)}`);
  for (const vuln of vulns) {
    printVulnerability(vuln);
  }
};

const runScanHooks = (vulns: Vulnerability[]): void => {
  const afterScan = executeHooks("scan", "after", { vulnerabilities: vulns });
  if (afterScan.warnings.length > EMPTY) {
    console.log("  Warnings:", afterScan.warnings);
  }
  verifyScanCompletion(vulns);
  printScanResults(vulns);
};

const runScanPhase = (): Vulnerability[] => {
  printHeader("Phase 1: Dependency Scan (Deterministic)");
  const beforeScan = executeHooks("scan", "before", { packageJson: DEMO_PACKAGE_JSON });
  if (beforeScan.errors.length > EMPTY) {
    console.log("Scan aborted:", beforeScan.errors);
    return [];
  }
  const vulns = scanDependencies();
  runScanHooks(vulns);
  return vulns;
};

const toTriageInput = (vuln: Vulnerability): TriageInput => ({
  cvssScore: vuln.cvssScore,
  packageName: vuln.packageName,
  reachable: vuln.reachable,
  severity: vuln.severity,
  title: vuln.title,
  vulnerabilityId: vuln.id,
});

const collectTriagePromises = (
  vulns: Vulnerability[],
): (TriageOutput | Promise<TriageOutput>)[] => {
  const results: (TriageOutput | Promise<TriageOutput>)[] = [];
  for (const vuln of vulns) {
    results.push(triageVulnerability(toTriageInput(vuln), { useMock: true }));
  }
  return results;
};

const runTriagePhase = async (vulns: Vulnerability[]): Promise<TriageOutput[]> => {
  printHeader("Phase 2: AI Triage (with Harness Sanity Checks)");
  const results = await Promise.all(collectTriagePromises(vulns));
  for (const result of results) {
    printTriageResult(result);
  }
  return results;
};

const printDriftWarnings = (triageResults: TriageOutput[]): void => {
  const afterTriage = executeHooks("triage", "after", { triageResults });
  if (afterTriage.warnings.length > EMPTY) {
    console.log("\n  Harness Warnings (Drift Detection):");
    for (const warning of afterTriage.warnings) {
      console.log(`    ⚠ ${warning}`);
    }
  }
};

const printQualityResults = (triageResults: TriageOutput[]): void => {
  const quality = checkTriageQuality(triageResults);
  console.log(`\n  Quality Check: ${quality.passed ? "PASSED" : "FAILED"}`);
  for (const check of quality.checks) {
    const mark = check.passed ? "✓" : "✗";
    console.log(`    [${mark}] ${check.name}: ${check.message}`);
  }
};

const printTriageCompletion = (triageResults: TriageOutput[]): void => {
  const criticals = triageResults.filter(
    (tr) => tr.severity === "CRITICAL" || tr.severity === "HIGH",
  );
  const triagePlanner = createTriagePlanner({
    criticalCount: criticals.length,
    totalVulnerabilities: triageResults.length,
    triagedCriticalCount: criticals.length,
    triagedTotal: triageResults.length,
  });
  console.log(triagePlanner.formatStatus());
};

const runHarnessChecks = (triageResults: TriageOutput[]): void => {
  printHeader("Phase 2b: Harness Quality Checks");
  printDriftWarnings(triageResults);
  printQualityResults(triageResults);
  printTriageCompletion(triageResults);
};

const buildKnowledgeBase = (triageResults: TriageOutput[]): KnowledgeBase => {
  let kb: KnowledgeBase = createEmptyKnowledgeBase();
  for (const result of triageResults) {
    kb = addTriageRecord(kb, {
      confidence: result.confidence,
      impact: result.impact,
      packageName: result.packageName,
      reasoning: result.reasoning,
      timestamp: new Date().toISOString(),
      vulnerabilityId: result.vulnerability,
    });
  }
  return kb;
};

const simulateHumanFeedback = (kb: KnowledgeBase): KnowledgeBase => {
  console.log("\n  Simulating human feedback (corrections)...");
  let updated = addHumanFeedback({
    correctedImpact: "high",
    feedback: "corrected",
    kb,
    vulnerabilityId: "CVE-2022-24999",
  });
  updated = addHumanFeedback({
    correctedImpact: "high",
    feedback: "corrected",
    kb: updated,
    vulnerabilityId: "CVE-2021-44906",
  });
  console.log("    - CVE-2022-24999: corrected medium → high");
  console.log("    - CVE-2021-44906: corrected medium → high");
  return updated;
};

const runKnowledgePhase = (triageResults: TriageOutput[]): void => {
  printHeader("Phase 3: Knowledge & Improvement Loop");
  const kb = buildKnowledgeBase(triageResults);
  console.log(`\n  Knowledge base: ${String(kb.records.length)} triage records stored`);
  const updated = simulateHumanFeedback(kb);
  const proposals = analyzeForImprovements(updated.records);
  if (proposals.length > EMPTY) {
    console.log(`\n  Improvement proposals generated: ${String(proposals.length)}`);
    for (const proposal of proposals) {
      console.log(`\n${formatProposal(proposal)}`);
    }
  }
};

const printSummary = (): void => {
  printHeader("Demo Complete");
  console.log(`
  DepShield demonstrates the three-layer architecture:
  1. Harness: Lifecycle hooks, completion checklists, quality checks
  2. AI Agent: Context-dependent triage (mock mode for demo)
  3. Deterministic: Package scanning, reachability analysis, rule matching

  Key anti-drift measures demonstrated:
  - External completion checklist (not AI self-reported)
  - Sanity checks on AI triage (Critical → no-impact flagged)
  - Low-confidence escalation to human review
  - Knowledge improvement loop from human feedback
`);
};

const main = async (): Promise<void> => {
  printHeader("DepShield — Dependency Vulnerability Triage Service");
  console.log("  AI-Managed Service Prototype (Mock Mode)\n");
  registerDefaultHooks();
  const vulns = runScanPhase();
  const triageResults = await runTriagePhase(vulns);
  runHarnessChecks(triageResults);
  runKnowledgePhase(triageResults);
  printSummary();
};

await main();
