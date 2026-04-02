import { describe, expect, it } from "vitest";
import type { SkynetCausalEpisode } from "../causal-valence/episode-ledger.js";
import {
  buildSkynetRuntimeTrajectorySamples,
  encodeSkynetRuntimeTrajectoryFeatures,
} from "./trajectory-builder.js";
import {
  predictSkynetRuntimeObserverLabel,
  trainSkynetRuntimeObserverModel,
} from "./trajectory-learner.js";

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
      failureDomain: success ? "none" : "cognitive",
      failureClass: success ? "none" : "validation_error",
      targetSatisfied: bootstrapLabel === "progress" || bootstrapLabel === "relief",
      validationPassed: success,
      continuityDelta: bootstrapLabel === "progress" || bootstrapLabel === "relief" ? 0.7 : 0.05,
      recoveryBurden: bootstrapLabel === "damage" ? 0.8 : 0.1,
      collateralDamage: bootstrapLabel === "damage" ? 0.5 : 0,
    },
    bootstrapLabel,
  };
}

describe("skynet runtime trajectory learner", () => {
  it("encodes non-empty history-aware vectors", () => {
    const samples = buildSkynetRuntimeTrajectorySamples({
      episodes: [buildEpisode(1, "s", "stall", "noop"), buildEpisode(2, "s", "progress", "edit")],
    });

    expect(encodeSkynetRuntimeTrajectoryFeatures(samples[0]!).length).toBeGreaterThan(10);
  });

  it("predicts labels from a separable synthetic sequence dataset", () => {
    const samples = buildSkynetRuntimeTrajectorySamples({
      episodes: [
        buildEpisode(1, "a", "stall", "noop"),
        buildEpisode(2, "a", "progress", "edit"),
        buildEpisode(3, "a", "stall", "noop"),
        buildEpisode(4, "a", "progress", "edit"),
        buildEpisode(10, "b", "damage", "delete"),
        buildEpisode(11, "b", "stall", "noop"),
        buildEpisode(12, "b", "damage", "delete"),
        buildEpisode(13, "b", "stall", "noop"),
      ],
    });
    const model = trainSkynetRuntimeObserverModel(samples)!;
    const prediction = predictSkynetRuntimeObserverLabel(model, samples[0]!);

    expect(model.labels.length).toBeGreaterThanOrEqual(2);
    expect(["progress", "stall", "damage"]).toContain(prediction.label);
  });
});
