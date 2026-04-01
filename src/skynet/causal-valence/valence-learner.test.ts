import { describe, expect, it } from "vitest";
import type { SkynetCausalEpisode } from "./episode-ledger.js";
import {
  encodeSkynetCausalEpisodeFeatures,
  predictSkynetCausalValence,
  trainSkynetCausalValenceModel,
} from "./valence-learner.js";

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
      targetSatisfied: true,
      validationPassed: true,
      continuityDelta: 0.7,
      recoveryBurden: 0.1,
      collateralDamage: 0,
    },
    bootstrapLabel: params.bootstrapLabel,
  };
}

describe("skynet causal valence learner", () => {
  it("ignores task wording and learns from context plus transition structure", () => {
    const progressA = makeEpisode({
      bootstrapLabel: "progress",
      context: {
        taskText: "editar archivo importante",
        continuityFreshness: "fresh",
        failureStreak: 0,
        targetCount: 1,
        validationIntensity: 1,
      },
      transition: {
        targetPaths: ["src/app.ts"],
        operations: [{ path: "src/app.ts", kind: "edit", isTarget: true }],
      },
    });
    const progressB = makeEpisode({
      bootstrapLabel: "progress",
      context: {
        taskText: "completely different words",
        continuityFreshness: "fresh",
        failureStreak: 0,
        targetCount: 1,
        validationIntensity: 1,
      },
      transition: {
        targetPaths: ["src/router.ts"],
        operations: [{ path: "src/router.ts", kind: "edit", isTarget: true }],
      },
    });
    const damageA = makeEpisode({
      bootstrapLabel: "damage",
      context: {
        taskText: "editar archivo importante",
        continuityFreshness: "stale",
        failureStreak: 3,
        targetCount: 1,
        validationIntensity: 0.4,
      },
      transition: {
        targetPaths: ["src/app.ts"],
        operations: [
          { path: "src/app.ts", kind: "delete", isTarget: true },
          { path: "src/other.ts", kind: "delete" },
        ],
      },
    });
    const damageB = makeEpisode({
      bootstrapLabel: "damage",
      context: {
        taskText: "otra frase sin relación",
        continuityFreshness: "stale",
        failureStreak: 2,
        targetCount: 1,
        validationIntensity: 0.5,
      },
      transition: {
        targetPaths: ["src/router.ts"],
        operations: [
          { path: "src/router.ts", kind: "delete", isTarget: true },
          { path: "src/state.ts", kind: "delete" },
        ],
      },
    });

    const model = trainSkynetCausalValenceModel([progressA, progressB, damageA, damageB]);
    expect(model).not.toBeNull();

    const probe = makeEpisode({
      bootstrapLabel: "progress",
      context: {
        taskText: "palabras nuevas irrelevantes",
        continuityFreshness: "fresh",
        failureStreak: 0,
        targetCount: 1,
        validationIntensity: 1,
      },
      transition: {
        targetPaths: ["src/new.ts"],
        operations: [{ path: "src/new.ts", kind: "edit", isTarget: true }],
      },
    });

    const prediction = predictSkynetCausalValence(model!, probe);
    expect(prediction.label).toBe("progress");
  });

  it("encodes episodes without relying on text fields", () => {
    const a = makeEpisode({
      bootstrapLabel: "progress",
      context: {
        taskText: "delete file now",
        continuityFreshness: "fresh",
        failureStreak: 0,
        targetCount: 1,
        validationIntensity: 1,
      },
    });
    const b = makeEpisode({
      bootstrapLabel: "progress",
      context: {
        taskText: "something else entirely",
        continuityFreshness: "fresh",
        failureStreak: 0,
        targetCount: 1,
        validationIntensity: 1,
      },
    });

    expect(encodeSkynetCausalEpisodeFeatures(a)).toEqual(encodeSkynetCausalEpisodeFeatures(b));
  });
});
