// 決定論的コード層: ルールベースの脆弱性スキャン＆到達可能性分析
// AIに任せず確実に処理する部分

const EMPTY = 0;

interface Dependency {
  name: string;
  version: string;
}

interface Vulnerability {
  id: string;
  packageName: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  title: string;
  fixedVersion: string | null;
  cvssScore: number;
  reachable: boolean;
}

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

// モックCVEデータベース（プロトタイプ用）
const MOCK_CVE_DB: Record<string, Omit<Vulnerability, "packageName" | "reachable">> = {
  "axios@0.21.0": {
    cvssScore: 9.8,
    fixedVersion: "0.21.1",
    id: "CVE-2021-3749",
    severity: "CRITICAL",
    title: "Server-Side Request Forgery",
  },
  "express@4.17.0": {
    cvssScore: 5.3,
    fixedVersion: "4.17.3",
    id: "CVE-2022-24999",
    severity: "MEDIUM",
    title: "Open Redirect via qs prototype pollution",
  },
  "jsonwebtoken@8.5.0": {
    cvssScore: 9.1,
    fixedVersion: "9.0.0",
    id: "CVE-2022-23529",
    severity: "CRITICAL",
    title: "Insecure key retrieval via jwt.verify",
  },
  "lodash@4.17.20": {
    cvssScore: 7.4,
    fixedVersion: "4.17.21",
    id: "CVE-2021-23337",
    severity: "HIGH",
    title: "Command Injection via template function",
  },
  "minimist@1.2.5": {
    cvssScore: 5.6,
    fixedVersion: "1.2.6",
    id: "CVE-2021-44906",
    severity: "MEDIUM",
    title: "Prototype Pollution",
  },
};

const extractDepsFromSource = (source: Record<string, string>): Dependency[] =>
  Object.entries(source).map(([name, version]) => ({
    name,
    version: version.replace(/^[\^~]/, ""),
  }));

const parseDependencies = (packageJson: PackageJson): Dependency[] => {
  const fromDeps = packageJson.dependencies ? extractDepsFromSource(packageJson.dependencies) : [];
  const fromDev = packageJson.devDependencies
    ? extractDepsFromSource(packageJson.devDependencies)
    : [];
  return [...fromDeps, ...fromDev];
};

const scanForVulnerabilities = (dependencies: Dependency[]): Vulnerability[] => {
  const results: Vulnerability[] = [];
  for (const dep of dependencies) {
    const key = `${dep.name}@${dep.version}`;
    const cve = MOCK_CVE_DB[key] as Omit<Vulnerability, "packageName" | "reachable"> | undefined;
    if (typeof cve === "object") {
      results.push({ ...cve, packageName: dep.name, reachable: false });
    }
  }
  return results;
};

// 到達可能性分析（モック: importチェーンの簡易シミュレーション）
const MOCK_IMPORT_GRAPH: Record<string, string[]> = {
  "src/api/auth.ts": ["jsonwebtoken", "lodash"],
  "src/config.ts": ["minimist"],
  "src/index.ts": ["express", "jsonwebtoken"],
  "src/utils/http.ts": ["axios"],
};

const analyzeReachability = (vulnerabilities: Vulnerability[]): Vulnerability[] =>
  vulnerabilities.map((vuln) => {
    const importedIn = Object.entries(MOCK_IMPORT_GRAPH)
      .filter(([_file, imports]) => imports.includes(vuln.packageName))
      .map(([file]) => file);
    return { ...vuln, reachable: importedIn.length > EMPTY };
  });

export {
  analyzeReachability,
  parseDependencies,
  scanForVulnerabilities,
  type Dependency,
  type PackageJson,
  type Vulnerability,
};
