import fs from "node:fs/promises";
import path from "node:path";
import { resolveOmegaStateDir } from "./paths.js";

export type OmegaRuntimeObserverSignal = {
  updatedAt: number;
  freshness: "fresh" | "stale";
  accuracy: number;
  majorityBaseline: number;
  improvementOverBaseline: number;
  trajectorySamples: number;
  harvestedEpisodes: number;
  lookback: number;
  dominantLabel: string | null;
};

type RuntimeObserverArtifact = {
  updatedAt?: number;
  status?: string;
  accuracy?: number;
  majorityBaseline?: number;
  improvementOverBaseline?: number;
  trajectorySamples?: number;
  harvestedEpisodes?: number;
  lookback?: number;
  labelCoverage?: Record<string, number>;
};

const MIN_IMPROVEMENT = 0.08;
const MIN_SAMPLES = 32;
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

export function resolveOmegaRuntimeObserverArtifactPath(workspaceRoot: string): string {
  return path.join(
    resolveOmegaStateDir(workspaceRoot),
    "skynet-experiments",
    "agent_openskynet_main-runtime-observer-01.json",
  );
}

function deriveDominantLabel(labelCoverage: Record<string, number> | undefined): string | null {
  if (!labelCoverage) {
    return null;
  }
  return (
    Object.entries(labelCoverage)
      .sort((left, right) => right[1] - left[1])
      .map(([label]) => label)
      .at(0) ?? null
  );
}

export async function loadOmegaRuntimeObserverSignal(
  workspaceRoot: string,
): Promise<OmegaRuntimeObserverSignal | undefined> {
  try {
    const raw = await fs.readFile(resolveOmegaRuntimeObserverArtifactPath(workspaceRoot), "utf-8");
    const parsed = JSON.parse(raw) as RuntimeObserverArtifact;
    const updatedAt = typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0;
    const accuracy = typeof parsed.accuracy === "number" ? parsed.accuracy : 0;
    const majorityBaseline =
      typeof parsed.majorityBaseline === "number" ? parsed.majorityBaseline : 0;
    const improvementOverBaseline =
      typeof parsed.improvementOverBaseline === "number" ? parsed.improvementOverBaseline : 0;
    const trajectorySamples =
      typeof parsed.trajectorySamples === "number" ? parsed.trajectorySamples : 0;
    const harvestedEpisodes =
      typeof parsed.harvestedEpisodes === "number" ? parsed.harvestedEpisodes : 0;
    const lookback = typeof parsed.lookback === "number" ? parsed.lookback : 0;

    if (
      parsed.status !== "pass" ||
      updatedAt <= 0 ||
      trajectorySamples < MIN_SAMPLES ||
      improvementOverBaseline < MIN_IMPROVEMENT
    ) {
      return undefined;
    }

    return {
      updatedAt,
      freshness: Date.now() - updatedAt <= MAX_AGE_MS ? "fresh" : "stale",
      accuracy,
      majorityBaseline,
      improvementOverBaseline,
      trajectorySamples,
      harvestedEpisodes,
      lookback,
      dominantLabel: deriveDominantLabel(parsed.labelCoverage),
    };
  } catch {
    return undefined;
  }
}
