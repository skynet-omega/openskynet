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

describe("Separation Gap Validation", () => {
  it("verifies that similarity sharpening provides sufficient confidence separation", () => {
    // Prototype A: Strong Progress
    const progress = makeEpisode({
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

    // Prototype B: Strong Frustration (stalled progress, multiple failures)
    const frustration = makeEpisode({
      bootstrapLabel: "frustration",
      context: {
        continuityFreshness: "stale",
        failureStreak: 4,
        targetCount: 1,
        validationIntensity: 0.1,
      },
      transition: {
        targetPaths: ["a.ts"],
        operations: [{ path: "a.ts", kind: "noop", isTarget: true }],
      },
    });

    const model = trainSkynetCausalValenceModel([progress, frustration]);
    expect(model).not.toBeNull();

    // Prediction for a pure Progress prototype should have high confidence
    const predProgress = predictSkynetCausalValence(model!, progress);
    console.log(`[DEBUG] Progress confidence: ${predProgress.confidence.toFixed(4)}`);

    // Interpolated episode (exactly in the middle)
    const middle = makeEpisode({
      bootstrapLabel: "progress",
      context: {
        continuityFreshness: "aging", // halfway between fresh and stale
        failureStreak: 2, // halfway between 0 and 4
        targetCount: 1,
        validationIntensity: 0.5, // halfway between 1.0 and 0.1
      },
      // Transition is harder to interpolate, but let's try mid-way logic
      transition: {
        targetPaths: ["a.ts"],
        operations: [{ path: "a.ts", kind: "rename", isTarget: true }], // mid-way
      },
    });

    const predAmbiguous = predictSkynetCausalValence(model!, middle);
    console.log(`[DEBUG] Ambiguous confidence: ${predAmbiguous.confidence.toFixed(4)}`);

    // Requirement from memory/2026-04-02-lab-cycle.md:
    // Prototypical Confidence should be >= 0.15
    expect(predProgress.confidence).toBeGreaterThanOrEqual(0.15);

    // Ambiguous confidence should be low
    expect(predAmbiguous.confidence).toBeLessThan(0.15);
  });
});
