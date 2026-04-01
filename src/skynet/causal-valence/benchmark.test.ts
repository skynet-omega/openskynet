import { describe, expect, it } from "vitest";
import { runSkynetCausalValenceBenchmark } from "./benchmark.js";
import type { SkynetCausalEpisode } from "./episode-ledger.js";

function buildEpisode(
  index: number,
  label: SkynetCausalEpisode["bootstrapLabel"],
): SkynetCausalEpisode {
  const progressLike = label === "progress" || label === "relief";
  const failureLike = label === "damage" || label === "frustration";
  return {
    id: `${label}-${index}`,
    sessionKey: "agent:openskynet:main",
    recordedAt: index,
    context: {
      taskText: `${label} words ${index}`,
      continuityFreshness: label === "stall" ? "aging" : failureLike ? "stale" : "fresh",
      failureStreak: label === "relief" ? 2 : failureLike ? 3 : 0,
      targetCount: 1,
      validationIntensity: progressLike ? 1 : label === "stall" ? 0.4 : 0.2,
    },
    transition: {
      targetPaths: ["src/app.ts"],
      operations: progressLike
        ? [{ path: "src/app.ts", kind: "edit", isTarget: true }]
        : label === "stall"
          ? [{ path: "src/app.ts", kind: "noop", isTarget: true }]
          : [
              { path: "src/app.ts", kind: "delete", isTarget: true },
              { path: `src/collateral-${index}.ts`, kind: "delete" },
            ],
    },
    outcome: {
      status: progressLike ? "ok" : label === "stall" ? "ok" : "error",
      targetSatisfied: progressLike,
      validationPassed: progressLike,
      continuityDelta: progressLike ? 0.75 : label === "stall" ? 0.05 : 0,
      recoveryBurden: progressLike ? 0.1 : label === "stall" ? 0.2 : 0.9,
      collateralDamage: progressLike ? 0 : label === "stall" ? 0 : 0.7,
    },
    bootstrapLabel: label,
  };
}

describe("skynet causal valence benchmark", () => {
  it("passes on a separable synthetic dataset", () => {
    const episodes = [
      ...Array.from({ length: 4 }, (_, index) => buildEpisode(index, "progress")),
      ...Array.from({ length: 4 }, (_, index) => buildEpisode(index + 10, "stall")),
      ...Array.from({ length: 4 }, (_, index) => buildEpisode(index + 20, "damage")),
    ];
    const result = runSkynetCausalValenceBenchmark(episodes);

    expect(result.status).toBe("pass");
    expect(result.accuracy).toBeGreaterThanOrEqual(0.55);
    expect(result.improvementOverBaseline).toBeGreaterThanOrEqual(0.12);
  });

  it("fails fast when there is not enough coverage", () => {
    const episodes = [
      buildEpisode(1, "progress"),
      buildEpisode(2, "progress"),
      buildEpisode(3, "damage"),
    ];
    const result = runSkynetCausalValenceBenchmark(episodes);

    expect(result.status).toBe("insufficient_data");
    expect(result.failureReasons[0]).toContain("need at least");
  });
});
