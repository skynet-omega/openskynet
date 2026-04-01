import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { deriveSkynetCausalLabelCounts } from "../causal-valence/episode-ledger.js";
import { collectSkynetSessionTranscriptFiles } from "../causal-valence/observability-audit.js";
import { harvestSkynetObservedCausalEpisodes } from "../causal-valence/observed-harvester.js";
import { replaySkynetCognitiveKernelState } from "../cognitive-kernel/min-kernel.js";
import { runSkynetCognitiveKernelBenchmark } from "../cognitive-kernel/online-benchmark.js";
import { writeSkynetCognitiveKernelState } from "../cognitive-kernel/state-store.js";
import { buildSkynetRuntimeTrajectorySamples } from "../runtime-observer/trajectory-builder.js";

export type SkynetCognitiveKernel01Result = ReturnType<typeof runSkynetCognitiveKernelBenchmark> & {
  sessionKey: string;
  updatedAt: number;
  projectName: string;
  harvestedEpisodes: number;
  trajectorySamples: number;
  lookback: number;
  scannedSessionFiles: string[];
  sourceLabelCoverage: ReturnType<typeof deriveSkynetCausalLabelCounts>;
};

function sanitizeSessionKey(sessionKey: string): string {
  return (sessionKey.trim() || "main").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 64) || "main";
}

function defaultSessionsDir(): string {
  return path.join(os.homedir(), ".openskynet", "agents", "main", "sessions");
}

export function resolveSkynetCognitiveKernel01JsonPath(params: {
  workspaceRoot: string;
  sessionKey: string;
}): string {
  return path.join(
    params.workspaceRoot,
    ".openskynet",
    "skynet-experiments",
    `${sanitizeSessionKey(params.sessionKey)}-cognitive-kernel-01.json`,
  );
}

export function resolveSkynetCognitiveKernel01MarkdownPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, "memory", "SKYNET_EXPERIMENT_COGNITIVE_KERNEL_01.md");
}

function buildMarkdown(result: SkynetCognitiveKernel01Result): string {
  return [
    "# SKYNET Experiment - Cognitive Kernel 01",
    "",
    `Updated: ${new Date(result.updatedAt).toISOString()}`,
    `Session: ${result.sessionKey}`,
    `Status: ${result.status}`,
    `Harvested episodes: ${result.harvestedEpisodes}`,
    `Trajectory samples: ${result.trajectorySamples}`,
    `Lookback: ${result.lookback}`,
    `Warmup samples: ${result.warmupSamples}`,
    `Accuracy: ${result.accuracy.toFixed(2)}`,
    `Sequential majority baseline: ${result.majorityBaseline.toFixed(2)}`,
    `Improvement: ${result.improvementOverBaseline.toFixed(2)}`,
    "",
    "## Source Label Coverage",
    "",
    ...Object.entries(result.sourceLabelCoverage).map(([label, count]) => `- ${label}: ${count}`),
    "",
    "## Trajectory Label Coverage",
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

export async function runSkynetCognitiveKernel01(params: {
  workspaceRoot: string;
  sessionKey: string;
  lookback?: number;
  sessionsDir?: string;
}): Promise<SkynetCognitiveKernel01Result> {
  const lookback = Math.max(1, Math.min(6, params.lookback ?? 3));
  const sessionFiles = await collectSkynetSessionTranscriptFiles(
    params.sessionsDir ?? defaultSessionsDir(),
  );
  const harvested = await harvestSkynetObservedCausalEpisodes({ sessionFiles });
  const trajectorySamples = buildSkynetRuntimeTrajectorySamples({
    episodes: harvested.episodes,
    lookback,
  });
  const benchmark = runSkynetCognitiveKernelBenchmark({ samples: trajectorySamples });
  const result: SkynetCognitiveKernel01Result = {
    sessionKey: params.sessionKey,
    updatedAt: Date.now(),
    projectName: "Skynet",
    harvestedEpisodes: harvested.episodes.length,
    trajectorySamples: trajectorySamples.length,
    lookback,
    scannedSessionFiles: sessionFiles,
    sourceLabelCoverage: deriveSkynetCausalLabelCounts(harvested.episodes),
    ...benchmark,
  };

  const jsonPath = resolveSkynetCognitiveKernel01JsonPath(params);
  const markdownPath = resolveSkynetCognitiveKernel01MarkdownPath(params.workspaceRoot);
  await fs.mkdir(path.dirname(jsonPath), { recursive: true });
  await fs.mkdir(path.dirname(markdownPath), { recursive: true });
  await fs.writeFile(jsonPath, JSON.stringify(result, null, 2) + "\n", "utf-8");
  await fs.writeFile(markdownPath, buildMarkdown(result), "utf-8");
  const state = replaySkynetCognitiveKernelState({ samples: trajectorySamples });
  if (state) {
    await writeSkynetCognitiveKernelState({
      workspaceRoot: params.workspaceRoot,
      sessionKey: params.sessionKey,
      state,
    });
  }
  return result;
}

async function main() {
  const result = await runSkynetCognitiveKernel01({
    workspaceRoot: process.cwd(),
    sessionKey: "agent:openskynet:main",
  });
  console.log(`--- ${result.projectName} Experiment: Cognitive Kernel 01 ---`);
  console.log(`Status: ${result.status}`);
  console.log(`Samples: ${result.trajectorySamples}`);
  console.log(`Accuracy: ${result.accuracy.toFixed(2)}`);
  console.log(`Baseline: ${result.majorityBaseline.toFixed(2)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
