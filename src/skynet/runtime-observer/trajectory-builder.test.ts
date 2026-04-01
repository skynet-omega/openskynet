import { describe, expect, it } from "vitest";
import type { SkynetCausalEpisode } from "../causal-valence/episode-ledger.js";
import {
  buildSkynetRuntimeTrajectorySamples,
  deriveSkynetRuntimeTrajectoryFeatureSummary,
} from "./trajectory-builder.js";

function buildEpisode(
  index: number,
  bootstrapLabel: SkynetCausalEpisode["bootstrapLabel"],
  kind: "noop" | "edit" | "delete" = "noop",
): SkynetCausalEpisode {
  return {
    id: `episode-${index}`,
    sessionKey: "session-a",
    recordedAt: index,
    context: {
      continuityFreshness: "fresh",
      failureStreak: bootstrapLabel === "damage" ? 2 : 0,
      targetCount: 1,
      validationIntensity: kind === "noop" ? 0.2 : 0.8,
    },
    transition: {
      targetPaths: ["src/app.ts"],
      operations: [{ path: "src/app.ts", kind, isTarget: true }],
    },
    outcome: {
      status: bootstrapLabel === "damage" ? "error" : "ok",
      targetSatisfied: bootstrapLabel !== "stall" && bootstrapLabel !== "damage",
      validationPassed: bootstrapLabel !== "damage",
      continuityDelta: bootstrapLabel === "progress" ? 0.7 : bootstrapLabel === "stall" ? 0.05 : 0,
      recoveryBurden: bootstrapLabel === "damage" ? 0.8 : 0.1,
      collateralDamage: bootstrapLabel === "damage" ? 0.5 : 0,
    },
    bootstrapLabel,
  };
}

describe("skynet runtime trajectory builder", () => {
  it("builds per-session samples with bounded lookback", () => {
    const samples = buildSkynetRuntimeTrajectorySamples({
      episodes: [
        buildEpisode(1, "stall"),
        buildEpisode(2, "progress", "edit"),
        buildEpisode(3, "damage", "delete"),
      ],
      lookback: 2,
    });

    expect(samples).toHaveLength(2);
    expect(samples[0]?.historyEpisodes.map((episode) => episode.bootstrapLabel)).toEqual(["stall"]);
    expect(samples[1]?.historyEpisodes.map((episode) => episode.bootstrapLabel)).toEqual([
      "stall",
      "progress",
    ]);
  });

  it("derives history-aware feature summaries", () => {
    const [sample] = buildSkynetRuntimeTrajectorySamples({
      episodes: [buildEpisode(1, "stall"), buildEpisode(2, "progress", "edit")],
    });

    const summary = deriveSkynetRuntimeTrajectoryFeatureSummary(sample!);

    expect(summary.historyStallRatio).toBe(1);
    expect(summary.currentEditRatio).toBe(1);
    expect(summary.currentValidationIntensity).toBeGreaterThan(0.5);
  });
});
