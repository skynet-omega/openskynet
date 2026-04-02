import { describe, expect, it } from "vitest";
import type { SkynetCausalEpisode } from "./episode-ledger.js";
import { predictSkynetCausalValence, trainSkynetCausalValenceModel } from "./valence-learner.js";

function makeEpisode(
  params: Partial<SkynetCausalEpisode> & Pick<SkynetCausalEpisode, "bootstrapLabel">,
): SkynetCausalEpisode {
  return {
    id: params.id ?? `${params.bootstrapLabel}-${Math.random()}`,
    sessionKey: params.sessionKey ?? "agent:openskynet:main",
    recordedAt: params.recordedAt ?? 1,
    context: params.context ?? {
      taskText: "generic",
      continuityFreshness: "fresh",
      failureStreak: 0,
      targetCount: 1,
      validationIntensity: 1,
    },
    transition: params.transition ?? {
      targetPaths: ["src/app.ts"],
      operations: [{ path: "src/app.ts", kind: "edit", isTarget: true }],
    },
    outcome: params.outcome ?? {
      status: "ok",
      failureDomain: "none",
      failureClass: "none",
      targetSatisfied: true,
      validationPassed: true,
      continuityDelta: 0.7,
      recoveryBurden: 0.1,
      collateralDamage: 0,
    },
    bootstrapLabel: params.bootstrapLabel,
  };
}

describe("skynet causal valence confidence benchmark", () => {
  it("distinguishes between clear and ambiguous states via confidence score", () => {
    // 1. Train a basic model with two clear extremes
    const progressA = makeEpisode({
      bootstrapLabel: "progress",
      context: {
        continuityFreshness: "fresh",
        failureStreak: 0,
        targetCount: 1,
        validationIntensity: 1,
      },
      transition: {
        targetPaths: ["a.ts"],
        operations: [{ path: "a.ts", kind: "edit", isTarget: true }],
      },
    });
    const stallA = makeEpisode({
      bootstrapLabel: "stall",
      context: {
        continuityFreshness: "stale",
        failureStreak: 4,
        targetCount: 1,
        validationIntensity: 0.2,
      },
      transition: {
        targetPaths: ["b.ts"],
        operations: [{ path: "b.ts", kind: "noop", isTarget: true }],
      },
    });

    const model = trainSkynetCausalValenceModel([progressA, stallA]);
    expect(model).not.toBeNull();

    // 2. Clear Progress Probe
    const clearProgress = makeEpisode({
      bootstrapLabel: "progress",
      context: {
        continuityFreshness: "fresh",
        failureStreak: 0,
        targetCount: 1,
        validationIntensity: 1,
      },
      transition: {
        targetPaths: ["c.ts"],
        operations: [{ path: "c.ts", kind: "edit", isTarget: true }],
      },
    });
    const predClear = predictSkynetCausalValence(model!, clearProgress);

    // 3. Ambiguous Probe (Mixed features)
    const ambiguous = makeEpisode({
      bootstrapLabel: "stall", // label doesn't matter for prediction
      context: {
        continuityFreshness: "fresh",
        failureStreak: 2,
        targetCount: 1,
        validationIntensity: 0.6,
      },
      transition: {
        targetPaths: ["d.ts"],
        operations: [{ path: "d.ts", kind: "noop", isTarget: true }],
      },
    });
    const predAmbiguous = predictSkynetCausalValence(model!, ambiguous);

    console.log(
      `Clear State - Label: ${predClear.label}, Confidence: ${predClear.confidence.toFixed(4)}`,
    );
    console.log(
      `Ambiguous State - Label: ${predAmbiguous.label}, Confidence: ${predAmbiguous.confidence.toFixed(4)}`,
    );

    // Falsifiable assertions:
    // Confidence in a clear prototypical case should be significantly higher than in a mixed case.
    expect(predClear.confidence).toBeGreaterThan(0.4);
    expect(predAmbiguous.confidence).toBeLessThan(0.2);
    expect(predClear.confidence).toBeGreaterThan(predAmbiguous.confidence * 2);
  });
});
