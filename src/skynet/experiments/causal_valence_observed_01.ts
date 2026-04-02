import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  runSkynetCausalValenceBenchmark,
  type SkynetCausalValenceBenchmark,
} from "../causal-valence/benchmark.js";
import { deriveSkynetCausalLabelCounts } from "../causal-valence/episode-ledger.js";
import { collectSkynetSessionTranscriptFiles } from "../causal-valence/observability-audit.js";
import { harvestSkynetObservedCausalEpisodes } from "../causal-valence/observed-harvester.js";

export type SkynetCausalValenceObserved01Result = SkynetCausalValenceBenchmark & {
  sessionKey: string;
  updatedAt: number;
  projectName: string;
  harvestedEpisodes: number;
  skippedToolResults: number;
  harvestedToolResults: number;
  scannedSessionFiles: string[];
};

function sanitizeSessionKey(sessionKey: string): string {
  return (sessionKey.trim() || "main").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 64) || "main";
}

function defaultSessionsDir(): string {
  return path.join(os.homedir(), ".openskynet", "agents", "main", "sessions");
}

export function resolveSkynetCausalValenceObserved01JsonPath(params: {
  workspaceRoot: string;
  sessionKey: string;
}): string {
  return path.join(
    params.workspaceRoot,
    ".openskynet",
    "skynet-experiments",
    `${sanitizeSessionKey(params.sessionKey)}-causal-valence-observed-01.json`,
  );
}

export function resolveSkynetCausalValenceObserved01MarkdownPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, "memory", "SKYNET_EXPERIMENT_CAUSAL_VALENCE_OBSERVED_01.md");
}

function buildMarkdown(result: SkynetCausalValenceObserved01Result): string {
  return [
    "# SKYNET Experiment - Causal Valence Observed 01",
    "",
    `Updated: ${new Date(result.updatedAt).toISOString()}`,
    `Session: ${result.sessionKey}`,
    `Status: ${result.status}`,
    `Harvested episodes: ${result.harvestedEpisodes}`,
    `Harvested tool results: ${result.harvestedToolResults}`,
    `Skipped tool results: ${result.skippedToolResults}`,
    `Accuracy: ${result.accuracy.toFixed(2)}`,
    `Majority baseline: ${result.majorityBaseline.toFixed(2)}`,
    `Improvement: ${result.improvementOverBaseline.toFixed(2)}`,
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

export async function runSkynetCausalValenceObserved01(params: {
  workspaceRoot: string;
  sessionKey: string;
  sessionsDir?: string;
}): Promise<SkynetCausalValenceObserved01Result> {
  const sessionFiles = await collectSkynetSessionTranscriptFiles(
    params.sessionsDir ?? defaultSessionsDir(),
  );
  const harvested = await harvestSkynetObservedCausalEpisodes({ sessionFiles });
  const benchmark = runSkynetCausalValenceBenchmark(harvested.episodes);
  const result: SkynetCausalValenceObserved01Result = {
    sessionKey: params.sessionKey,
    updatedAt: Date.now(),
    projectName: "Skynet",
    harvestedEpisodes: harvested.episodes.length,
    skippedToolResults: harvested.skippedToolResults,
    harvestedToolResults: harvested.harvestedToolResults,
    scannedSessionFiles: sessionFiles,
    ...benchmark,
    labelCoverage: deriveSkynetCausalLabelCounts(harvested.episodes),
  };
  const jsonPath = resolveSkynetCausalValenceObserved01JsonPath(params);
  const markdownPath = resolveSkynetCausalValenceObserved01MarkdownPath(params.workspaceRoot);
  await fs.mkdir(path.dirname(jsonPath), { recursive: true });
  await fs.mkdir(path.dirname(markdownPath), { recursive: true });
  await fs.writeFile(jsonPath, JSON.stringify(result, null, 2) + "\n", "utf-8");
  await fs.writeFile(markdownPath, buildMarkdown(result), "utf-8");
  return result;
}

async function main() {
  const result = await runSkynetCausalValenceObserved01({
    workspaceRoot: process.cwd(),
    sessionKey: "agent:openskynet:main",
  });
  console.log(`--- ${result.projectName} Experiment: Causal Valence Observed 01 ---`);
  console.log(`Status: ${result.status}`);
  console.log(`Harvested episodes: ${result.harvestedEpisodes}`);
  console.log(`Accuracy: ${result.accuracy.toFixed(2)}`);
  console.log(`Baseline: ${result.majorityBaseline.toFixed(2)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
