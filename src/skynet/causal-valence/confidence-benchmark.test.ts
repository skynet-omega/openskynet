import { describe, it, expect } from "vitest";
import type { SkynetCausalEpisode, SkynetCausalValenceLabel } from "./episode-ledger.js";
import { predictSkynetCausalValence, trainSkynetCausalValenceModel } from "./valence-learner.js";

const BASE_EPISODE: Omit<
  SkynetCausalEpisode,
  "id" | "bootstrapLabel" | "context" | "transition" | "outcome"
> = {
  sessionKey: "test-session",
  recordedAt: Date.now(),
};

function createPrototype(label: SkynetCausalValenceLabel): SkynetCausalEpisode {
  const isOk = label === "progress" || label === "relief" || label === "stall";
  return {
    ...BASE_EPISODE,
    id: `proto-${label}`,
    bootstrapLabel: label,
    context: {
      continuityFreshness: label === "progress" ? "fresh" : label === "relief" ? "aging" : "stale",
      failureStreak: label === "frustration" ? 3 : label === "relief" ? 1 : 0,
      targetCount: label === "progress" ? 2 : 1,
      validationIntensity: label === "damage" ? 0.2 : 0.8,
    },
    transition: {
      operations:
        label === "progress"
          ? [
              { path: "file.ts", kind: "edit", isTarget: true },
              { path: "new.ts", kind: "create", isTarget: true },
            ]
          : label === "stall"
            ? [{ path: "random.txt", kind: "noop", isTarget: false }]
            : [],
    },
    outcome: {
      status: isOk ? "ok" : "error",
      failureDomain:
        label === "frustration" ? "environmental" : label === "damage" ? "cognitive" : "none",
      failureClass:
        label === "frustration"
          ? "provider_rate_limit"
          : label === "damage"
            ? "validation_error"
            : "none",
      targetSatisfied: label === "progress" || label === "relief",
      validationPassed: isOk,
      continuityDelta: label === "progress" ? 0.8 : label === "relief" ? 0.4 : 0.05,
      recoveryBurden: label === "damage" ? 0.9 : label === "frustration" ? 0.4 : 0.1,
      collateralDamage: label === "damage" ? 0.8 : 0,
    },
  };
}

const ambiguousEpisode: SkynetCausalEpisode = {
  ...BASE_EPISODE,
  id: "ambiguous-1",
  bootstrapLabel: "stall",
  context: {
    continuityFreshness: "aging",
    failureStreak: 0,
    targetCount: 1,
    validationIntensity: 0.5,
  },
  transition: {
    operations: [{ path: "random.txt", kind: "edit", isTarget: false }],
  },
  outcome: {
    status: "ok",
    failureDomain: "none",
    failureClass: "none",
    targetSatisfied: false,
    validationPassed: true,
    continuityDelta: 0.25,
    recoveryBurden: 0.1,
    collateralDamage: 0.1,
  },
};

describe("Skynet Causal Valence Confidence Benchmark", () => {
  const prototypes = (
    ["progress", "relief", "stall", "frustration", "damage"] as SkynetCausalValenceLabel[]
  ).map(createPrototype);
  const trainingData: SkynetCausalEpisode[] = [];
  for (const p of prototypes) {
    for (let i = 0; i < 10; i++) trainingData.push({ ...p, id: `${p.id}-${i}` });
  }
  const model = trainSkynetCausalValenceModel(trainingData)!;

  it("should have high confidence (> 0.2) for prototypical episodes", () => {
    for (const p of prototypes) {
      const prediction = predictSkynetCausalValence(model, p);
      expect(prediction.confidence).toBeGreaterThan(0.2);
    }
  });

  it("should have lower confidence (< 0.2) for ambiguous episodes", () => {
    const ambPrediction = predictSkynetCausalValence(model, ambiguousEpisode);
    expect(ambPrediction.confidence).toBeLessThan(0.2);
  });
});
