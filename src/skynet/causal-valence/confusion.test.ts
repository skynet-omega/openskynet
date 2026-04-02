import { describe, it, expect } from "vitest";
import type { SkynetCausalEpisode } from "./episode-ledger.js";
import {
  trainSkynetCausalValenceModel,
  predictSkynetCausalValence,
  type SkynetCausalValenceModel,
  encodeSkynetCausalEpisodeFeatures,
} from "./valence-learner.js";

describe("Causal Valence Confusion Benchmark", () => {
  const mockEpisode = (
    label: "progress" | "stall" | "damage",
    features: { failureStreak: number; collateralDamage: number },
  ): SkynetCausalEpisode => ({
    id: `id-${Math.random()}`,
    sessionKey: "session-1",
    recordedAt: Date.now(),
    bootstrapLabel: label,
    context: {
      continuityFreshness: "fresh",
      failureStreak: features.failureStreak,
      targetCount: 1,
      validationIntensity: 0.5,
    },
    transition: {
      operations: [{ path: "file.ts", kind: "edit" }],
      targetPaths: ["file.ts"],
    },
    outcome: {
      status: "ok",
      failureDomain: "none",
      failureClass: "none",
      targetSatisfied: true,
      validationPassed: true,
      continuityDelta: 0.5,
      recoveryBurden: 0,
      collateralDamage: features.collateralDamage,
    },
  });

  const trainEpisodes: SkynetCausalEpisode[] = [
    // Progress: low streak, low damage
    mockEpisode("progress", { failureStreak: 0, collateralDamage: 0 }),
    mockEpisode("progress", { failureStreak: 0, collateralDamage: 0.05 }),
    mockEpisode("progress", { failureStreak: 1, collateralDamage: 0 }),
    // Damage: high damage
    mockEpisode("damage", { failureStreak: 0, collateralDamage: 0.8 }),
    mockEpisode("damage", { failureStreak: 1, collateralDamage: 0.9 }),
    mockEpisode("damage", { failureStreak: 0, collateralDamage: 0.7 }),
    // Stall: low progress indicators (though here we simplify to streak)
    mockEpisode("stall", { failureStreak: 0, collateralDamage: 0.4 }),
    mockEpisode("stall", { failureStreak: 0, collateralDamage: 0.35 }),
  ];

  const model = trainSkynetCausalValenceModel(trainEpisodes)!;

  it("identifies clear 'progress' with high confidence", () => {
    const clearProgress = mockEpisode("progress", { failureStreak: 0, collateralDamage: 0 });
    const prediction = predictSkynetCausalValence(model, clearProgress);
    expect(prediction.label).toBe("progress");
    expect(prediction.confidence).toBeGreaterThan(0.4);
    console.log(`Clear Progress Confidence: ${prediction.confidence.toFixed(4)}`);
  });

  it("identifies clear 'damage' with high confidence", () => {
    const clearDamage = mockEpisode("damage", { failureStreak: 0, collateralDamage: 0.9 });
    const prediction = predictSkynetCausalValence(model, clearDamage);
    expect(prediction.label).toBe("damage");
    expect(prediction.confidence).toBeGreaterThan(0.4);
    console.log(`Clear Damage Confidence: ${prediction.confidence.toFixed(4)}`);
  });

  it("identifies 'stall' vs 'damage' boundary confusion (low confidence)", () => {
    // Stall is ~0.4 damage in training. 0.55 is right in the middle between Stall (0.4) and Damage (0.7+).
    const ambiguousEpisode = mockEpisode("stall", { failureStreak: 0, collateralDamage: 0.55 });
    const prediction = predictSkynetCausalValence(model, ambiguousEpisode);

    // We expect lower confidence because it's between centroids
    expect(prediction.confidence).toBeLessThan(0.2);
    console.log(
      `Ambiguous (Stall/Damage) Prediction: ${prediction.label}, Confidence: ${prediction.confidence.toFixed(4)}`,
    );
  });

  it("quantifies confusion when features are missing", () => {
    // Create an episode that doesn't fit any centroid well
    const weirdEpisode: SkynetCausalEpisode = {
      ...mockEpisode("progress", { failureStreak: 4, collateralDamage: 0.5 }),
      transition: { operations: [], targetPaths: [] }, // Noop transition
    };
    const prediction = predictSkynetCausalValence(model, weirdEpisode);
    console.log(
      `Weird Episode Prediction: ${prediction.label}, Confidence: ${prediction.confidence.toFixed(4)}`,
    );
    expect(prediction.confidence).toBeLessThan(0.3);
  });
});
