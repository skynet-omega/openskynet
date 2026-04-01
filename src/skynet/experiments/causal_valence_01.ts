import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  runSkynetCausalValenceBenchmark,
  type SkynetCausalValenceBenchmark,
} from "../causal-valence/benchmark.js";
import {
  loadSkynetCausalEpisodes,
  resolveSkynetCausalEpisodeLedgerPath,
} from "../causal-valence/episode-ledger.js";

export type SkynetCausalValence01Result = SkynetCausalValenceBenchmark & {
  sessionKey: string;
  updatedAt: number;
  projectName: string;
  ledgerPath: string;
};

function sanitizeSessionKey(sessionKey: string): string {
  return (sessionKey.trim() || "main").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 64) || "main";
}

export function resolveSkynetCausalValence01JsonPath(params: {
  workspaceRoot: string;
  sessionKey: string;
}): string {
  return path.join(
    params.workspaceRoot,
    ".openskynet",
    "skynet-experiments",
    `${sanitizeSessionKey(params.sessionKey)}-causal-valence-01.json`,
  );
}

export function resolveSkynetCausalValence01MarkdownPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, "memory", "SKYNET_EXPERIMENT_CAUSAL_VALENCE_01.md");
}

export function deriveSkynetCausalValence01Result(params: {
  workspaceRoot: string;
  sessionKey: string;
  benchmark: SkynetCausalValenceBenchmark;
}): SkynetCausalValence01Result {
  return {
    sessionKey: params.sessionKey,
    updatedAt: Date.now(),
    projectName: "Skynet",
    ledgerPath: resolveSkynetCausalEpisodeLedgerPath(params.workspaceRoot),
    ...params.benchmark,
  };
}

function buildResultMarkdown(result: SkynetCausalValence01Result): string {
  return [
    "# SKYNET Experiment - Causal Valence 01",
    "",
    `Updated: ${new Date(result.updatedAt).toISOString()}`,
    `Session: ${result.sessionKey}`,
    `Status: ${result.status}`,
    `Evaluated episodes: ${result.evaluatedEpisodes}`,
    `Accuracy: ${result.accuracy.toFixed(2)}`,
    `Majority baseline: ${result.majorityBaseline.toFixed(2)}`,
    `Improvement: ${result.improvementOverBaseline.toFixed(2)}`,
    `Ledger: ${result.ledgerPath}`,
    "",
    "## Label Coverage",
    "",
    ...Object.entries(result.labelCoverage).map(([label, count]) => `- ${label}: ${count}`),
    "",
    "## Failure Reasons",
    "",
    ...(result.failureReasons.length > 0
      ? result.failureReasons.map((reason) => `- ${reason}`)
      : ["- none"]),
    "",
  ].join("\n");
}

export async function runSkynetCausalValence01(params: {
  workspaceRoot: string;
  sessionKey: string;
}): Promise<SkynetCausalValence01Result> {
  const episodes = await loadSkynetCausalEpisodes(params.workspaceRoot);
  const benchmark = runSkynetCausalValenceBenchmark(episodes);
  const result = deriveSkynetCausalValence01Result({
    workspaceRoot: params.workspaceRoot,
    sessionKey: params.sessionKey,
    benchmark,
  });
  const jsonPath = resolveSkynetCausalValence01JsonPath(params);
  const markdownPath = resolveSkynetCausalValence01MarkdownPath(params.workspaceRoot);
  await fs.mkdir(path.dirname(jsonPath), { recursive: true });
  await fs.mkdir(path.dirname(markdownPath), { recursive: true });
  await fs.writeFile(jsonPath, JSON.stringify(result, null, 2) + "\n", "utf-8");
  await fs.writeFile(markdownPath, buildResultMarkdown(result), "utf-8");
  return result;
}

async function main() {
  const result = await runSkynetCausalValence01({
    workspaceRoot: process.cwd(),
    sessionKey: "agent:openskynet:main",
  });
  console.log(`--- ${result.projectName} Experiment: Causal Valence 01 ---`);
  console.log(`Status: ${result.status}`);
  console.log(`Accuracy: ${result.accuracy.toFixed(2)}`);
  console.log(`Majority baseline: ${result.majorityBaseline.toFixed(2)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
