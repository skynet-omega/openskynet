import fs from "node:fs/promises";
import path from "node:path";
import type { SkynetCognitiveKernelState } from "./min-kernel.js";

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function resolveSkynetCognitiveKernelStatePath(
  workspaceRoot: string,
  sessionKey: string,
): string {
  const safeSessionKey =
    (sessionKey.trim() || "main").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 64) || "main";
  return path.join(
    workspaceRoot,
    ".openskynet",
    "skynet-experiments",
    `${safeSessionKey}-cognitive-kernel-state.json`,
  );
}

export async function writeSkynetCognitiveKernelState(params: {
  workspaceRoot: string;
  sessionKey: string;
  state: SkynetCognitiveKernelState;
}): Promise<void> {
  const statePath = resolveSkynetCognitiveKernelStatePath(params.workspaceRoot, params.sessionKey);
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, JSON.stringify(params.state, null, 2) + "\n", "utf-8");
}

export async function loadSkynetCognitiveKernelState(params: {
  workspaceRoot: string;
  sessionKey: string;
}): Promise<SkynetCognitiveKernelState | null> {
  try {
    const raw = await fs.readFile(
      resolveSkynetCognitiveKernelStatePath(params.workspaceRoot, params.sessionKey),
      "utf-8",
    );
    const parsed = JSON.parse(raw) as Partial<SkynetCognitiveKernelState>;
    if (
      !Array.isArray(parsed.labels) ||
      !Array.isArray(parsed.latent) ||
      typeof parsed.featureDimensions !== "number" ||
      typeof parsed.observedCount !== "number"
    ) {
      return null;
    }
    return {
      labels: parsed.labels,
      latent: parsed.latent.map((value) => (typeof value === "number" ? value : 0)),
      featureDimensions: Math.max(1, Math.round(parsed.featureDimensions)),
      config: {
        latentRetention: clamp01(parsed.config?.latentRetention ?? 0.72),
        transitionWeight: clamp01(parsed.config?.transitionWeight ?? 0.18),
        surpriseWeight: clamp01(parsed.config?.surpriseWeight ?? 0.12),
      },
      prototypeCounts: parsed.prototypeCounts ?? {
        progress: 0,
        relief: 0,
        stall: 0,
        frustration: 0,
        damage: 0,
      },
      prototypes: parsed.prototypes ?? {
        progress: [],
        relief: [],
        stall: [],
        frustration: [],
        damage: [],
      },
      transitionCounts: parsed.transitionCounts ?? {
        progress: { progress: 0, relief: 0, stall: 0, frustration: 0, damage: 0 },
        relief: { progress: 0, relief: 0, stall: 0, frustration: 0, damage: 0 },
        stall: { progress: 0, relief: 0, stall: 0, frustration: 0, damage: 0 },
        frustration: { progress: 0, relief: 0, stall: 0, frustration: 0, damage: 0 },
        damage: { progress: 0, relief: 0, stall: 0, frustration: 0, damage: 0 },
      },
      observedCount: Math.max(0, Math.round(parsed.observedCount)),
      ...(Array.isArray(parsed.seenSampleIds)
        ? {
            seenSampleIds: parsed.seenSampleIds.filter(
              (value): value is string => typeof value === "string" && value.trim().length > 0,
            ),
          }
        : {}),
      ...(typeof parsed.lastObservedLabel === "string"
        ? { lastObservedLabel: parsed.lastObservedLabel }
        : {}),
    };
  } catch {
    return null;
  }
}
