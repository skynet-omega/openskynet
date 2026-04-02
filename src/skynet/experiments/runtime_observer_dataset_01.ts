import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { deriveSkynetCausalLabelCounts } from "../causal-valence/episode-ledger.js";
import { collectSkynetSessionTranscriptFiles } from "../causal-valence/observability-audit.js";
import { harvestSkynetObservedCausalEpisodes } from "../causal-valence/observed-harvester.js";
import {
  buildSkynetRuntimeTrajectorySamples,
  encodeSkynetRuntimeTrajectoryFeatures,
} from "../runtime-observer/trajectory-builder.js";

export type SkynetRuntimeObserverDatasetRow = {
  id: string;
  sessionKey: string;
  recordedAt: number;
  targetLabel: string;
  features: number[];
};

export type SkynetRuntimeObserverDataset01 = {
  updatedAt: number;
  projectName: string;
  sessionKey: string;
  harvestedEpisodes: number;
  trajectorySamples: number;
  featureDimensions: number;
  labelCoverage: Record<string, number>;
  scannedSessionFiles: string[];
  rows: SkynetRuntimeObserverDatasetRow[];
};

function sanitizeSessionKey(sessionKey: string): string {
  return (sessionKey.trim() || "main").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 64) || "main";
}

function defaultSessionsDir(): string {
  return path.join(os.homedir(), ".openskynet", "agents", "main", "sessions");
}

export function resolveSkynetRuntimeObserverDataset01Path(params: {
  workspaceRoot: string;
  sessionKey: string;
}): string {
  return path.join(
    params.workspaceRoot,
    ".openskynet",
    "skynet-experiments",
    `${sanitizeSessionKey(params.sessionKey)}-runtime-observer-dataset-01.json`,
  );
}

export async function runSkynetRuntimeObserverDataset01(params: {
  workspaceRoot: string;
  sessionKey: string;
  lookback?: number;
  sessionsDir?: string;
}): Promise<SkynetRuntimeObserverDataset01> {
  const lookback = Math.max(1, Math.min(6, params.lookback ?? 3));
  const sessionFiles = await collectSkynetSessionTranscriptFiles(
    params.sessionsDir ?? defaultSessionsDir(),
  );
  const harvested = await harvestSkynetObservedCausalEpisodes({ sessionFiles });
  const trajectorySamples = buildSkynetRuntimeTrajectorySamples({
    episodes: harvested.episodes,
    lookback,
  });
  const rows = trajectorySamples.map((sample) => ({
    id: sample.id,
    sessionKey: sample.sessionKey,
    recordedAt: sample.recordedAt,
    targetLabel: sample.targetLabel,
    features: encodeSkynetRuntimeTrajectoryFeatures(sample),
  }));
  const result: SkynetRuntimeObserverDataset01 = {
    updatedAt: Date.now(),
    projectName: "Skynet",
    sessionKey: params.sessionKey,
    harvestedEpisodes: harvested.episodes.length,
    trajectorySamples: trajectorySamples.length,
    featureDimensions: rows[0]?.features.length ?? 0,
    labelCoverage: deriveSkynetCausalLabelCounts(harvested.episodes),
    scannedSessionFiles: sessionFiles,
    rows,
  };
  const outPath = resolveSkynetRuntimeObserverDataset01Path(params);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(result, null, 2) + "\n", "utf-8");
  return result;
}

async function main() {
  const result = await runSkynetRuntimeObserverDataset01({
    workspaceRoot: process.cwd(),
    sessionKey: "agent:openskynet:main",
  });
  console.log(`--- ${result.projectName} Experiment: Runtime Observer Dataset 01 ---`);
  console.log(`Rows: ${result.rows.length}`);
  console.log(`Feature dimensions: ${result.featureDimensions}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
