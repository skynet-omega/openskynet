import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { deriveSkynetCausalLabelCounts } from "../causal-valence/episode-ledger.js";
import { collectSkynetSessionTranscriptFiles } from "../causal-valence/observability-audit.js";
import { harvestSkynetObservedCausalEpisodes } from "../causal-valence/observed-harvester.js";
import {
  createSkynetCognitiveKernelState,
  updateSkynetCognitiveKernelState,
} from "../cognitive-kernel/min-kernel.js";
import {
  loadSkynetCognitiveKernelState,
  writeSkynetCognitiveKernelState,
} from "../cognitive-kernel/state-store.js";
import {
  buildSkynetRuntimeTrajectorySamples,
  encodeSkynetRuntimeTrajectoryFeatures,
} from "../runtime-observer/trajectory-builder.js";

export type SkynetCognitiveKernelLive01Result = {
  sessionKey: string;
  updatedAt: number;
  projectName: string;
  harvestedEpisodes: number;
  trajectorySamples: number;
  ingestedSamples: number;
  skippedSamples: number;
  observedCount: number;
  scannedSessionFiles: string[];
  sourceLabelCoverage: ReturnType<typeof deriveSkynetCausalLabelCounts>;
  statePath: string;
};

function sanitizeSessionKey(sessionKey: string): string {
  return (sessionKey.trim() || "main").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 64) || "main";
}

function defaultSessionsDir(): string {
  return path.join(os.homedir(), ".openskynet", "agents", "main", "sessions");
}

export function resolveSkynetCognitiveKernelLive01JsonPath(params: {
  workspaceRoot: string;
  sessionKey: string;
}): string {
  return path.join(
    params.workspaceRoot,
    ".openskynet",
    "skynet-experiments",
    `${sanitizeSessionKey(params.sessionKey)}-cognitive-kernel-live-01.json`,
  );
}

async function runSkynetCognitiveKernelLive01(params: {
  workspaceRoot: string;
  sessionKey: string;
  lookback?: number;
  sessionsDir?: string;
}): Promise<SkynetCognitiveKernelLive01Result> {
  const lookback = Math.max(1, Math.min(6, params.lookback ?? 3));
  const sessionFiles = await collectSkynetSessionTranscriptFiles(
    params.sessionsDir ?? defaultSessionsDir(),
  );
  const harvested = await harvestSkynetObservedCausalEpisodes({ sessionFiles });
  const trajectorySamples = buildSkynetRuntimeTrajectorySamples({
    episodes: harvested.episodes,
    lookback,
  });

  const loadedState = await loadSkynetCognitiveKernelState({
    workspaceRoot: params.workspaceRoot,
    sessionKey: params.sessionKey,
  });
  const featureDimensions =
    trajectorySamples.length > 0
      ? encodeSkynetRuntimeTrajectoryFeatures(trajectorySamples[0]).length
      : 0;
  const baseState =
    loadedState && loadedState.featureDimensions === featureDimensions
      ? loadedState
      : trajectorySamples.length > 0
        ? createSkynetCognitiveKernelState({
            featureDimensions,
          })
        : null;

  if (!baseState) {
    throw new Error("No trajectory samples available to update cognitive kernel state.");
  }

  const updated = updateSkynetCognitiveKernelState({
    state: baseState,
    samples: trajectorySamples,
  });
  await writeSkynetCognitiveKernelState({
    workspaceRoot: params.workspaceRoot,
    sessionKey: params.sessionKey,
    state: updated.state,
  });

  const statePath = path.join(
    params.workspaceRoot,
    ".openskynet",
    "skynet-experiments",
    `${sanitizeSessionKey(params.sessionKey)}-cognitive-kernel-state.json`,
  );
  const result: SkynetCognitiveKernelLive01Result = {
    sessionKey: params.sessionKey,
    updatedAt: Date.now(),
    projectName: "Skynet",
    harvestedEpisodes: harvested.episodes.length,
    trajectorySamples: trajectorySamples.length,
    ingestedSamples: updated.ingestedCount,
    skippedSamples: updated.skippedCount,
    observedCount: updated.state.observedCount,
    scannedSessionFiles: sessionFiles,
    sourceLabelCoverage: deriveSkynetCausalLabelCounts(harvested.episodes),
    statePath,
  };

  const jsonPath = resolveSkynetCognitiveKernelLive01JsonPath(params);
  await fs.mkdir(path.dirname(jsonPath), { recursive: true });
  await fs.writeFile(jsonPath, JSON.stringify(result, null, 2) + "\n", "utf-8");
  return result;
}

async function main() {
  const result = await runSkynetCognitiveKernelLive01({
    workspaceRoot: process.cwd(),
    sessionKey: "agent:openskynet:main",
  });
  console.log(`--- ${result.projectName} Experiment: Cognitive Kernel Live 01 ---`);
  console.log(`Episodes: ${result.harvestedEpisodes}`);
  console.log(`Trajectory samples: ${result.trajectorySamples}`);
  console.log(`Ingested: ${result.ingestedSamples}`);
  console.log(`Skipped: ${result.skippedSamples}`);
  console.log(`Observed count: ${result.observedCount}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export { runSkynetCognitiveKernelLive01 };
