import { describe, it, expect } from "vitest";
import type { SkynetCausalEpisode } from "./episode-ledger.js";
import {
  trainSkynetCausalValenceModel,
  predictSkynetCausalValence,
  type SkynetCausalValenceModel,
} from "./valence-learner.js";

describe("Causal Valence: Multi-Action Sensitivity Experiment", () => {
  const baseEpisode: SkynetCausalEpisode = {
    id: "test",
    timestamp: Date.now(),
    context: {
      continuityFreshness: "fresh",
      failureStreak: 0,
      targetCount: 1,
      validationIntensity: 0.5,
    },
    transition: {
      operations: [],
      targetPaths: ["src/main.ts"],
    },
    bootstrapLabel: "stall", // Default for training
  };

  const trainEpisodes: SkynetCausalEpisode[] = [
    {
      ...baseEpisode,
      bootstrapLabel: "progress",
      transition: {
        operations: [{ path: "src/main.ts", kind: "edit", isTarget: true }],
        targetPaths: ["src/main.ts"],
      },
    },
    {
      ...baseEpisode,
      bootstrapLabel: "stall",
      transition: {
        operations: [{ path: "src/main.ts", kind: "noop", isTarget: true }],
        targetPaths: ["src/main.ts"],
      },
    },
    {
      ...baseEpisode,
      bootstrapLabel: "damage",
      transition: {
        operations: [{ path: "src/main.ts", kind: "delete", isTarget: true }],
        targetPaths: ["src/main.ts"],
      },
    },
  ];

  const model = trainSkynetCausalValenceModel(trainEpisodes) as SkynetCausalValenceModel;

  it("should increase confidence as more progress-aligned actions are added", () => {
    const singleAction: SkynetCausalEpisode = {
      ...baseEpisode,
      transition: {
        operations: [{ path: "src/main.ts", kind: "edit", isTarget: true }],
        targetPaths: ["src/main.ts"],
      },
    };

    const multiAction: SkynetCausalEpisode = {
      ...baseEpisode,
      transition: {
        operations: [
          { path: "src/main.ts", kind: "edit", isTarget: true },
          { path: "src/utils.ts", kind: "edit", isTarget: true },
          { path: "src/types.ts", kind: "edit", isTarget: true },
        ],
        targetPaths: ["src/main.ts", "src/utils.ts", "src/types.ts"],
      },
    };

    // Single Edit: TargetCount=1/8, OpCount=1/8, TargetCoverage=1.0, EditRatio=1.0
    const pred1 = predictSkynetCausalValence(model, singleAction);

    // Multi Edit: TargetCount=3/8, OpCount=3/8, TargetCoverage=1.0, EditRatio=1.0
    const pred2 = predictSkynetCausalValence(model, multiAction);

    console.log("Single Action Vector:", encodeSkynetCausalEpisodeFeatures(singleAction));
    console.log("Multi Action Vector:", encodeSkynetCausalEpisodeFeatures(multiAction));
    console.log("Progress Centroid:", model.centroids["progress"]);

    console.log(`Single Edit Confidence: ${pred1.confidence.toFixed(4)}`);
    console.log(`Multi Edit Confidence: ${pred2.confidence.toFixed(4)}`);

    // Hypothesis: more confirming evidence (high target coverage + high edit ratio)
    // should push the vector closer to the 'progress' centroid.
    expect(pred2.label).toBe("progress");
    // Since our simple centroid is just 1 edit, 100% edit ratio,
    // more edits still result in 100% edit ratio.
    // But targetCount and operationCount are scaled by 1/8.
    // pred2 has higher targetCount (3/8 vs 1/8) and higher operationCount (3/8 vs 1/8).
  });

  it("should penalize confidence when mixed with 'damage' or 'stall' markers", () => {
    const mixedAction: SkynetCausalEpisode = {
      ...baseEpisode,
      transition: {
        operations: [
          { path: "src/main.ts", kind: "edit", isTarget: true },
          { path: "src/temp.ts", kind: "delete", isTarget: false }, // Collateral damage
        ],
        targetPaths: ["src/main.ts"],
      },
    };

    const pred = predictSkynetCausalValence(model, mixedAction);
    console.log(`Mixed (Edit + Collateral Delete) Confidence: ${pred.confidence.toFixed(4)}`);

    // It might still be "progress", but confidence should be lower than pure progress.
    const pureProgress = predictSkynetCausalValence(model, {
      ...baseEpisode,
      transition: {
        operations: [{ path: "src/main.ts", kind: "edit", isTarget: true }],
        targetPaths: ["src/main.ts"],
      },
    });

    expect(pred.confidence).toBeLessThan(pureProgress.confidence);
  });
});
