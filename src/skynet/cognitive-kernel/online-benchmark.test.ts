import { describe, expect, it } from "vitest";
import type { SkynetCausalEpisode } from "../causal-valence/episode-ledger.js";
import type { SkynetRuntimeTrajectorySample } from "../runtime-observer/trajectory-builder.js";
import { runSkynetCognitiveKernelBenchmark } from "./online-benchmark.js";

function buildEpisode(params: {
  id: string;
  label: SkynetCausalEpisode["bootstrapLabel"];
  kind: "edit" | "delete" | "create" | "noop";
}): SkynetCausalEpisode {
  return {
    id: params.id,
    sessionKey: "agent:openskynet:main",
    recordedAt: Number(params.id.replace(/\D+/g, "")) || 1,
    context: {
      continuityFreshness: "fresh",
      failureStreak: params.label === "frustration" ? 2 : 0,
      targetCount: 1,
      validationIntensity: params.kind === "edit" ? 0.8 : 0.2,
    },
    transition: {
      operations: [{ path: `/tmp/${params.id}.ts`, kind: params.kind, isTarget: true }],
      targetPaths: [`/tmp/${params.id}.ts`],
    },
    outcome: {
      status: params.label === "damage" ? "error" : "ok",
      failureDomain: params.label === "damage" ? "cognitive" : "none",
      failureClass: params.label === "damage" ? "validation_error" : "none",
      targetSatisfied: params.label === "progress" || params.label === "relief",
      validationPassed: params.label !== "damage",
      continuityDelta: params.label === "progress" || params.label === "relief" ? 0.8 : 0.05,
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
  historyLabels: SkynetCausalEpisode["bootstrapLabel"][],
): SkynetRuntimeTrajectorySample {
  const historyEpisodes = historyLabels.map((historyLabel, index) =>
    buildEpisode({
      id: `${id}-${index}`,
      label: historyLabel,
      kind: historyLabel === "damage" ? "delete" : historyLabel === "stall" ? "noop" : "edit",
    }),
  );
  const currentEpisode = buildEpisode({ id, label, kind });
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

describe("skynet cognitive kernel benchmark", () => {
  it("passes on a separable online-learning dataset", () => {
    const samples: SkynetRuntimeTrajectorySample[] = [];
    for (let index = 0; index < 12; index += 1) {
      samples.push(
        buildSample(`p${index}`, "progress", "edit", ["progress", "relief", "progress"]),
        buildSample(`s${index}`, "stall", "noop", ["stall", "stall", "progress"]),
        buildSample(`d${index}`, "damage", "delete", ["damage", "frustration", "damage"]),
      );
    }

    const result = runSkynetCognitiveKernelBenchmark({ samples, warmupSamples: 6 });

    expect(result.status).toBe("pass");
    expect(result.accuracy).toBeGreaterThan(result.majorityBaseline);
  });
});
