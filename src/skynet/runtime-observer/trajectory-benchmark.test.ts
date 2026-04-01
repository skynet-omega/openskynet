import { describe, expect, it } from "vitest";
import type { SkynetCausalEpisode } from "../causal-valence/episode-ledger.js";
import { runSkynetRuntimeObserverBenchmark } from "./trajectory-benchmark.js";
import { buildSkynetRuntimeTrajectorySamples } from "./trajectory-builder.js";

function buildEpisode(
  index: number,
  sessionKey: string,
  bootstrapLabel: SkynetCausalEpisode["bootstrapLabel"],
  kind: "noop" | "edit" | "delete",
): SkynetCausalEpisode {
  const success = bootstrapLabel !== "damage";
  return {
    id: `${sessionKey}-${index}`,
    sessionKey,
    recordedAt: index,
    context: {
      continuityFreshness: bootstrapLabel === "stall" ? "aging" : "fresh",
      failureStreak: bootstrapLabel === "damage" ? 2 : bootstrapLabel === "relief" ? 1 : 0,
      targetCount: 1,
      validationIntensity: kind === "noop" ? 0.2 : 0.9,
    },
    transition: {
      targetPaths: ["src/app.ts"],
      operations: [{ path: "src/app.ts", kind, isTarget: true }],
    },
    outcome: {
      status: success ? "ok" : "error",
      targetSatisfied: bootstrapLabel === "progress" || bootstrapLabel === "relief",
      validationPassed: success,
      continuityDelta: bootstrapLabel === "progress" || bootstrapLabel === "relief" ? 0.7 : 0.05,
      recoveryBurden: bootstrapLabel === "damage" ? 0.8 : 0.1,
      collateralDamage: bootstrapLabel === "damage" ? 0.5 : 0,
    },
    bootstrapLabel,
  };
}

describe("skynet runtime observer benchmark", () => {
  it("passes on a history-dependent synthetic dataset", () => {
    const episodes: SkynetCausalEpisode[] = [];
    for (let i = 0; i < 10; i += 1) {
      episodes.push(buildEpisode(i * 3 + 1, "progress-session", "stall", "noop"));
      episodes.push(buildEpisode(i * 3 + 2, "progress-session", "progress", "edit"));
      episodes.push(buildEpisode(i * 3 + 3, "progress-session", "stall", "noop"));
    }
    for (let i = 0; i < 10; i += 1) {
      episodes.push(buildEpisode(i * 3 + 101, "damage-session", "damage", "delete"));
      episodes.push(buildEpisode(i * 3 + 102, "damage-session", "stall", "noop"));
      episodes.push(buildEpisode(i * 3 + 103, "damage-session", "damage", "delete"));
    }

    const samples = buildSkynetRuntimeTrajectorySamples({ episodes, lookback: 2 });
    const result = runSkynetRuntimeObserverBenchmark(samples);

    expect(result.status).toBe("pass");
    expect(result.accuracy).toBeGreaterThanOrEqual(0.5);
    expect(result.improvementOverBaseline).toBeGreaterThanOrEqual(0.08);
  });

  it("fails with insufficient coverage", () => {
    const samples = buildSkynetRuntimeTrajectorySamples({
      episodes: [
        buildEpisode(1, "small", "stall", "noop"),
        buildEpisode(2, "small", "progress", "edit"),
        buildEpisode(3, "small", "stall", "noop"),
      ],
    });
    const result = runSkynetRuntimeObserverBenchmark(samples);

    expect(result.status).toBe("insufficient_data");
  });
});
