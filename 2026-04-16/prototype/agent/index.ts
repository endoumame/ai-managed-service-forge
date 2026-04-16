// AIエージェント層: 脆弱性トリアージ推論
// 推論のアップサイドが大きい部分をAIが担当する

const FIRST_MATCH = 0;
const MAX_TOKENS = 1024;
const FIRST_BLOCK = 0;

interface TriageInput {
  packageName: string;
  vulnerabilityId: string;
  severity: string;
  title: string;
  reachable: boolean;
  cvssScore: number;
}

interface TriageOutput {
  packageName: string;
  vulnerability: string;
  severity: string;
  impact: "critical" | "high" | "medium" | "low" | "none";
  confidence: number;
  reasoning: string;
  requiresHumanReview: boolean;
}

interface TriageOptions {
  useMock: boolean;
  client?: ClaudeClient;
}

interface ClaudeClient {
  messages: {
    create: (
      params: Record<string, unknown>,
    ) => Promise<{ content: { type: string; text?: string }[] }>;
  };
}

const CONFIDENCE_HIGH = 0.9;
const CONFIDENCE_MEDIUM = 0.75;
const CONFIDENCE_LOW = 0.6;

const buildUnreachableResult = (input: TriageInput): TriageOutput => ({
  confidence: CONFIDENCE_HIGH,
  impact: "none",
  packageName: input.packageName,
  reasoning: `Package ${input.packageName} (${input.vulnerabilityId}) is not reachable from any application code path. The vulnerable function is not imported or invoked.`,
  requiresHumanReview: false,
  severity: input.severity,
  vulnerability: input.vulnerabilityId,
});

const buildReachableResult = (input: TriageInput): TriageOutput => {
  const impactMap: Record<string, TriageOutput["impact"]> = {
    CRITICAL: "critical",
    HIGH: "high",
    LOW: "low",
    MEDIUM: "medium",
  };
  return {
    confidence: input.severity === "CRITICAL" ? CONFIDENCE_MEDIUM : CONFIDENCE_LOW,
    impact: impactMap[input.severity] ?? "medium",
    packageName: input.packageName,
    reasoning: `Package ${input.packageName} (${input.vulnerabilityId}): "${input.title}" — vulnerability is reachable via import chain. CVSS score ${String(input.cvssScore)} indicates ${input.severity} risk. Recommend immediate patching.`,
    requiresHumanReview: input.severity === "CRITICAL",
    severity: input.severity,
    vulnerability: input.vulnerabilityId,
  };
};

const mockTriage = (input: TriageInput): TriageOutput =>
  input.reachable ? buildReachableResult(input) : buildUnreachableResult(input);

const buildTriagePrompt = (input: TriageInput): string =>
  [
    `Analyze this dependency vulnerability and assess its real-world impact:`,
    `Package: ${input.packageName}`,
    `Vulnerability: ${input.vulnerabilityId} - ${input.title}`,
    `Severity: ${input.severity} (CVSS: ${String(input.cvssScore)})`,
    `Reachable from code: ${String(input.reachable)}`,
    ``,
    `Respond in JSON: {"impact":"critical|high|medium|low|none","confidence":0.0-1.0,"reasoning":"...","requiresHumanReview":true|false}`,
  ].join("\n");

const IMPACT_LOOKUP = new Map<string, TriageOutput["impact"]>([
  ["critical", "critical"],
  ["high", "high"],
  ["medium", "medium"],
  ["low", "low"],
  ["none", "none"],
]);

const toImpact = (value: unknown): TriageOutput["impact"] => {
  if (typeof value !== "string") {
    return "medium";
  }
  return IMPACT_LOOKUP.get(value) ?? "medium";
};

const extractParsedFields = (
  record: Record<string, unknown>,
  input: TriageInput,
): TriageOutput => ({
  confidence: typeof record["confidence"] === "number" ? record["confidence"] : CONFIDENCE_LOW,
  impact: toImpact(record["impact"]),
  packageName: input.packageName,
  reasoning:
    typeof record["reasoning"] === "string" ? record["reasoning"] : "Unable to parse reasoning",
  requiresHumanReview:
    typeof record["requiresHumanReview"] === "boolean" ? record["requiresHumanReview"] : true,
  severity: input.severity,
  vulnerability: input.vulnerabilityId,
});

const isRecord = (value: object): value is Record<string, unknown> => typeof value === "object";

const parseTriageResponse = (text: string, input: TriageInput): TriageOutput => {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return mockTriage(input);
  }
  const parsed: unknown = JSON.parse(jsonMatch[FIRST_MATCH]);
  if (typeof parsed !== "object" || parsed === null || !isRecord(parsed)) {
    return mockTriage(input);
  }
  return extractParsedFields(parsed, input);
};

const callClaudeForTriage = async (
  client: ClaudeClient,
  input: TriageInput,
): Promise<TriageOutput> => {
  const message = await client.messages.create({
    max_tokens: MAX_TOKENS,
    messages: [{ content: buildTriagePrompt(input), role: "user" }],
    model: "claude-sonnet-4-20250514",
  });
  const block = message.content[FIRST_BLOCK];
  if (block.type !== "text" || typeof block.text !== "string") {
    return mockTriage(input);
  }
  return parseTriageResponse(block.text, input);
};

const triageWithClient = async (
  client: ClaudeClient,
  input: TriageInput,
): Promise<TriageOutput> => {
  try {
    return await callClaudeForTriage(client, input);
  } catch {
    return mockTriage(input);
  }
};

const triageVulnerability = (
  input: TriageInput,
  options: TriageOptions,
): Promise<TriageOutput> | TriageOutput => {
  if (options.useMock || !options.client) {
    return mockTriage(input);
  }
  return triageWithClient(options.client, input);
};

export { mockTriage, triageVulnerability, type TriageInput, type TriageOptions, type TriageOutput };
