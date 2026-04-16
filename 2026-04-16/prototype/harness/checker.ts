// ハーネス層: 品質チェック
// AIの出力を決定論的に検証し、品質基準を満たさない場合はフィードバックする

const EMPTY = 0;
const SINGLE_IMPACT = 1;
const MIN_REASONING_LENGTH = 20;
const CRITICAL_NO_IMPACT_THRESHOLD = 0.5;
const SCAN_COVERAGE_THRESHOLD = 0.95;
const PERCENT = 100;
const DECIMAL_PLACES = 0;
const COVERAGE_DECIMAL_PLACES = 1;

interface QualityCheckResult {
  passed: boolean;
  checks: {
    name: string;
    passed: boolean;
    message: string;
  }[];
}

interface TriageResult {
  packageName: string;
  vulnerability: string;
  severity: string;
  impact: string;
  confidence: number;
  reasoning: string;
}

const checkReasoningCompleteness = (
  results: TriageResult[],
): QualityCheckResult["checks"][number] => {
  const allHaveReasoning = results.every((tr) => tr.reasoning.length > MIN_REASONING_LENGTH);
  return {
    message: allHaveReasoning
      ? "All triage results have substantive reasoning"
      : "Some triage results lack sufficient reasoning",
    name: "reasoning_completeness",
    passed: allHaveReasoning,
  };
};

const groupByPackage = (results: TriageResult[]): Map<string, TriageResult[]> => {
  const groups = new Map<string, TriageResult[]>();
  for (const tr of results) {
    const group = groups.get(tr.packageName) ?? [];
    group.push(tr);
    groups.set(tr.packageName, group);
  }
  return groups;
};

const checkConsistency = (results: TriageResult[]): QualityCheckResult["checks"] => {
  const packageGroups = groupByPackage(results);
  const inconsistencies: QualityCheckResult["checks"] = [];
  for (const [pkg, group] of packageGroups) {
    const impacts = new Set(group.map((tr) => tr.impact));
    if (impacts.size > SINGLE_IMPACT) {
      inconsistencies.push({
        message: `Inconsistent impact assessment for ${pkg}: ${[...impacts].join(", ")}`,
        name: "consistency",
        passed: false,
      });
    }
  }
  if (inconsistencies.length > EMPTY) {
    return inconsistencies;
  }
  return [
    { message: "All triage results are internally consistent", name: "consistency", passed: true },
  ];
};

const checkCriticalSanity = (results: TriageResult[]): QualityCheckResult["checks"][number] => {
  const criticals = results.filter((tr) => tr.severity === "CRITICAL");
  const criticalNoImpact = criticals.filter((tr) => tr.impact === "none");
  const ratio = criticals.length > EMPTY ? criticalNoImpact.length / criticals.length : EMPTY;
  const passed = ratio < CRITICAL_NO_IMPACT_THRESHOLD;
  return {
    message: passed
      ? `Critical no-impact ratio: ${(ratio * PERCENT).toFixed(DECIMAL_PLACES)}% (acceptable)`
      : `Critical no-impact ratio: ${(ratio * PERCENT).toFixed(DECIMAL_PLACES)}% — unusually high, review needed`,
    name: "critical_sanity",
    passed,
  };
};

const checkTriageQuality = (results: TriageResult[]): QualityCheckResult => {
  const checks: QualityCheckResult["checks"] = [
    checkReasoningCompleteness(results),
    ...checkConsistency(results),
    checkCriticalSanity(results),
  ];
  return {
    checks,
    passed: checks.every((ch) => ch.passed),
  };
};

const checkScanCoverage = (
  scannedPackages: string[],
  totalPackages: string[],
): QualityCheckResult => {
  const coverage = scannedPackages.length / totalPackages.length;
  const missing = totalPackages.filter((pkg) => !scannedPackages.includes(pkg));

  return {
    checks: [
      {
        message:
          coverage >= SCAN_COVERAGE_THRESHOLD
            ? `Scan coverage: ${(coverage * PERCENT).toFixed(COVERAGE_DECIMAL_PLACES)}%`
            : `Scan coverage only ${(coverage * PERCENT).toFixed(COVERAGE_DECIMAL_PLACES)}% — missing: ${missing.join(", ")}`,
        name: "scan_coverage",
        passed: coverage >= SCAN_COVERAGE_THRESHOLD,
      },
    ],
    passed: coverage >= SCAN_COVERAGE_THRESHOLD,
  };
};

export { checkScanCoverage, checkTriageQuality, type QualityCheckResult, type TriageResult };
