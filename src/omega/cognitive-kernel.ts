import fs from "node:fs/promises";
import path from "node:path";
import { resolveOmegaStateDir } from "./paths.js";

export type OmegaCognitiveKernelSignal = {
  updatedAt: number;
  freshness: "fresh" | "stale";
  accuracy: number;
  majorityBaseline: number;
  improvementOverBaseline: number;
  trajectorySamples: number;
  harvestedEpisodes: number;
  evaluatedSamples: number;
  warmupSamples: number;
  dominantLabel: string | null;
  active: boolean;
  activationReason: "enabled_by_default" | "deactivated_accuracy" | "deactivated_stale";
  targetAccuracy: number;
  deactivationThreshold: number;
};

type CognitiveKernelArtifact = {
  updatedAt?: number;
  status?: string;
  accuracy?: number;
  majorityBaseline?: number;
  improvementOverBaseline?: number;
  trajectorySamples?: number;
  harvestedEpisodes?: number;
  evaluatedSamples?: number;
  warmupSamples?: number;
  labelCoverage?: Record<string, number>;
};

const MIN_SAMPLES = 48;
const MAX_AGE_MS = 12 * 60 * 60 * 1000;
const TARGET_ACCURACY = 0.9;
const DEACTIVATE_ACCURACY = 0.8;

export function resolveOmegaCognitiveKernelArtifactPath(workspaceRoot: string): string {
  return path.join(
    resolveOmegaStateDir(workspaceRoot),
    "skynet-experiments",
    "agent_openskynet_main-cognitive-kernel-01.json",
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

export async function loadOmegaCognitiveKernelSignal(
  workspaceRoot: string,
): Promise<OmegaCognitiveKernelSignal | undefined> {
  try {
    const raw = await fs.readFile(resolveOmegaCognitiveKernelArtifactPath(workspaceRoot), "utf-8");
    const parsed = JSON.parse(raw) as CognitiveKernelArtifact;
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
    const evaluatedSamples =
      typeof parsed.evaluatedSamples === "number" ? parsed.evaluatedSamples : 0;
    const warmupSamples = typeof parsed.warmupSamples === "number" ? parsed.warmupSamples : 0;
    if (parsed.status !== "pass" || updatedAt <= 0 || trajectorySamples < MIN_SAMPLES) {
      return undefined;
    }

    const freshness = Date.now() - updatedAt <= MAX_AGE_MS ? "fresh" : "stale";
    const active =
      freshness === "fresh" && Number.isFinite(accuracy) && accuracy >= DEACTIVATE_ACCURACY;

    return {
      updatedAt,
      freshness,
      accuracy,
      majorityBaseline,
      improvementOverBaseline,
      trajectorySamples,
      harvestedEpisodes,
      evaluatedSamples,
      warmupSamples,
      dominantLabel: deriveDominantLabel(parsed.labelCoverage),
      active,
      activationReason:
        freshness !== "fresh"
          ? "deactivated_stale"
          : active
            ? "enabled_by_default"
            : "deactivated_accuracy",
      targetAccuracy: TARGET_ACCURACY,
      deactivationThreshold: DEACTIVATE_ACCURACY,
    };
  } catch {
    return undefined;
  }
}
