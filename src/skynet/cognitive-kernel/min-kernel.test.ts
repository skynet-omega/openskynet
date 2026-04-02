import { describe, expect, it } from "vitest";
import type { SkynetCausalEpisode } from "../causal-valence/episode-ledger.js";
import {
  encodeSkynetRuntimeTrajectoryFeatures,
  type SkynetRuntimeTrajectorySample,
} from "../runtime-observer/trajectory-builder.js";
import {
  createSkynetCognitiveKernelState,
  observeSkynetCognitiveKernelSample,
  predictSkynetCognitiveKernelLabel,
  replaySkynetCognitiveKernelState,
  updateSkynetCognitiveKernelState,
} from "./min-kernel.js";

function buildEpisode(params: {
  id: string;
  label: SkynetCausalEpisode["bootstrapLabel"];
  kind: "edit" | "delete" | "create" | "noop";
  status?: "ok" | "error" | "timeout";
  failureStreak?: number;
}): SkynetCausalEpisode {
  return {
    id: params.id,
    sessionKey: "agent:openskynet:main",
    recordedAt: Number(params.id.replace(/\D+/g, "")) || 1,
    context: {
      continuityFreshness: "fresh",
      failureStreak: params.failureStreak ?? 0,
      targetCount: 1,
      validationIntensity: params.kind === "edit" ? 0.8 : 0.3,
    },
    transition: {
      operations: [{ path: `/tmp/${params.id}.ts`, kind: params.kind, isTarget: true }],
      targetPaths: [`/tmp/${params.id}.ts`],
    },
    outcome: {
      status: params.status ?? (params.label === "damage" ? "error" : "ok"),
      failureDomain:
        params.label === "damage"
          ? "cognitive"
          : params.status === "timeout"
            ? "environmental"
            : "none",
      failureClass:
        params.label === "damage"
          ? "validation_error"
          : params.status === "timeout"
            ? "provider_timeout"
            : "none",
      targetSatisfied: params.label !== "stall" && params.label !== "damage",
      validationPassed: params.label !== "damage",
      continuityDelta: params.label === "progress" || params.label === "relief" ? 0.7 : 0.05,
      recoveryBurden: params.label === "frustration" ? 0.6 : 0.1,
      collateralDamage: params.label === "damage" ? 0.8 : 0.05,
    },
    bootstrapLabel: params.label,
  };
}

function buildSample(
  id: string,
  label: SkynetCausalEpisode["bootstrapLabel"],
  kind: "edit" | "delete" | "create" | "noop",
  historyLabels: SkynetCausalEpisode["bootstrapLabel"][] = [],
): SkynetRuntimeTrajectorySample {
  const historyEpisodes = historyLabels.map((historyLabel, index) =>
    buildEpisode({
      id: `${id}-history-${index}`,
      label: historyLabel,
      kind: historyLabel === "damage" ? "delete" : "edit",
      failureStreak: historyLabel === "frustration" ? 2 : 0,
    }),
  );
  const currentEpisode = buildEpisode({
    id,
    label,
    kind,
    failureStreak: label === "frustration" ? 2 : 0,
  });
  return {
    id,
    sessionKey: "agent:openskynet:main",
    recordedAt: currentEpisode.recordedAt,
    lookbackCount: historyEpisodes.length,
    historyEpisodes,
    currentEpisode,
    targetLabel: label,
  };
}

describe("skynet cognitive kernel", () => {
  it("learns separable trajectory prototypes online", () => {
    const progressSeed = buildSample("10", "progress", "edit", ["progress", "progress"]);
    const damageSeed = buildSample("20", "damage", "delete", ["damage", "frustration"]);
    const state0 = createSkynetCognitiveKernelState({
      featureDimensions: encodeSkynetRuntimeTrajectoryFeatures(progressSeed).length,
    });
    const state1 = observeSkynetCognitiveKernelSample(state0, progressSeed);
    const state2 = observeSkynetCognitiveKernelSample(state1, damageSeed);

    const progressPrediction = predictSkynetCognitiveKernelLabel(
      state2,
      buildSample("30", "progress", "edit", ["progress", "relief"]),
    );
    const damagePrediction = predictSkynetCognitiveKernelLabel(
      state2,
      buildSample("40", "damage", "delete", ["damage", "frustration"]),
    );

    expect(progressPrediction.label).toBe("progress");
    expect(damagePrediction.label).toBe("damage");
    expect(progressPrediction.surprise).toBeLessThan(0.8);
  });

  it("can replay state from a sample stream", () => {
    const samples = [
      buildSample("10", "progress", "edit", ["progress"]),
      buildSample("20", "damage", "delete", ["damage"]),
      buildSample("30", "progress", "edit", ["progress", "relief"]),
    ];
    const state = replaySkynetCognitiveKernelState({ samples });
    expect(state).not.toBeNull();
    expect(state?.observedCount).toBe(3);
    expect(state?.prototypeCounts.progress).toBe(2);
  });

  it("updates incrementally without double-counting seen samples", () => {
    const samples = [
      buildSample("10", "progress", "edit", ["progress"]),
      buildSample("20", "damage", "delete", ["damage"]),
    ];
    const state0 = createSkynetCognitiveKernelState({
      featureDimensions: encodeSkynetRuntimeTrajectoryFeatures(samples[0]!).length,
    });
    const first = updateSkynetCognitiveKernelState({ state: state0, samples });
    const second = updateSkynetCognitiveKernelState({ state: first.state, samples });

    expect(first.ingestedCount).toBe(2);
    expect(first.skippedCount).toBe(0);
    expect(second.ingestedCount).toBe(0);
    expect(second.skippedCount).toBe(2);
    expect(second.state.observedCount).toBe(2);
  });
});
