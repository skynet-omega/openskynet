import type { SkynetCausalValenceLabel } from "../causal-valence/episode-ledger.js";
import type { SkynetRuntimeTrajectorySample } from "../runtime-observer/trajectory-builder.js";
import { encodeSkynetRuntimeTrajectoryFeatures } from "../runtime-observer/trajectory-builder.js";
import {
  createSkynetCognitiveKernelState,
  observeSkynetCognitiveKernelSample,
  predictSkynetCognitiveKernelLabel,
} from "./min-kernel.js";

export type SkynetCognitiveKernelBenchmark = {
  status: "pass" | "fail" | "insufficient_data";
  accuracy: number;
  majorityBaseline: number;
  improvementOverBaseline: number;
  evaluatedSamples: number;
  warmupSamples: number;
  labelCoverage: Partial<Record<SkynetCausalValenceLabel, number>>;
  failureReasons: string[];
};

const MIN_SAMPLES = 32;
const MIN_LABELS = 3;
const MIN_LABEL_COUNT = 4;
const MIN_ACCURACY = 0.58;
const MIN_IMPROVEMENT = 0.08;
const DEFAULT_WARMUP = 8;

function roundMetric(value: number): number {
  return Number(value.toFixed(4));
}

function deriveLabelCoverage(
  samples: SkynetRuntimeTrajectorySample[],
): Partial<Record<SkynetCausalValenceLabel, number>> {
  const coverage: Partial<Record<SkynetCausalValenceLabel, number>> = {};
  for (const sample of samples) {
    coverage[sample.targetLabel] = (coverage[sample.targetLabel] ?? 0) + 1;
  }
  return coverage;
}

function deriveSequentialMajorityLabel(
  seenLabels: SkynetCausalValenceLabel[],
): SkynetCausalValenceLabel | null {
  if (seenLabels.length === 0) {
    return null;
  }
  const counts = seenLabels.reduce(
    (acc, label) => {
      acc[label] = (acc[label] ?? 0) + 1;
      return acc;
    },
    {} as Record<SkynetCausalValenceLabel, number>,
  );
  return (Object.entries(counts)
    .sort((left, right) => right[1] - left[1])
    .at(0)?.[0] ?? null) as SkynetCausalValenceLabel | null;
}

export function runSkynetCognitiveKernelBenchmark(params: {
  samples: SkynetRuntimeTrajectorySample[];
  warmupSamples?: number;
}): SkynetCognitiveKernelBenchmark {
  const samples = [...params.samples].sort((left, right) => {
    if (left.sessionKey !== right.sessionKey) {
      return left.sessionKey.localeCompare(right.sessionKey);
    }
    return left.recordedAt - right.recordedAt;
  });
  const coverage = deriveLabelCoverage(samples);
  const representedLabels = Object.values(coverage).filter(
    (count) => (count ?? 0) >= MIN_LABEL_COUNT,
  );
  const failureReasons: string[] = [];
  const warmupSamples = Math.max(4, Math.min(16, params.warmupSamples ?? DEFAULT_WARMUP));

  if (samples.length < MIN_SAMPLES) {
    failureReasons.push(`need at least ${MIN_SAMPLES} samples`);
  }
  if (representedLabels.length < MIN_LABELS) {
    failureReasons.push(`need at least ${MIN_LABELS} labels with >=${MIN_LABEL_COUNT} samples`);
  }
  if (failureReasons.length > 0) {
    return {
      status: "insufficient_data",
      accuracy: 0,
      majorityBaseline: 0,
      improvementOverBaseline: 0,
      evaluatedSamples: 0,
      warmupSamples,
      labelCoverage: coverage,
      failureReasons,
    };
  }

  const featureDimensions =
    samples.length > 0 ? encodeSkynetRuntimeTrajectoryFeatures(samples[0]!).length : 0;
  let state = createSkynetCognitiveKernelState({ featureDimensions });
  const seenLabels: SkynetCausalValenceLabel[] = [];
  let evaluatedSamples = 0;
  let correct = 0;
  let baselineCorrect = 0;

  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    const baselineLabel = deriveSequentialMajorityLabel(seenLabels);
    if (index >= warmupSamples && baselineLabel) {
      const prediction = predictSkynetCognitiveKernelLabel(state, sample);
      evaluatedSamples += 1;
      if (prediction.label === sample.targetLabel) {
        correct += 1;
      }
      if (baselineLabel === sample.targetLabel) {
        baselineCorrect += 1;
      }
    }
    state = observeSkynetCognitiveKernelSample(state, sample);
    seenLabels.push(sample.targetLabel);
  }

  if (evaluatedSamples === 0) {
    return {
      status: "insufficient_data",
      accuracy: 0,
      majorityBaseline: 0,
      improvementOverBaseline: 0,
      evaluatedSamples: 0,
      warmupSamples,
      labelCoverage: coverage,
      failureReasons: ["benchmark produced zero evaluable samples"],
    };
  }

  const accuracy = correct / evaluatedSamples;
  const majorityBaseline = baselineCorrect / evaluatedSamples;
  const improvementOverBaseline = accuracy - majorityBaseline;
  if (accuracy < MIN_ACCURACY) {
    failureReasons.push(`accuracy ${accuracy.toFixed(2)} < ${MIN_ACCURACY.toFixed(2)}`);
  }
  if (improvementOverBaseline < MIN_IMPROVEMENT) {
    failureReasons.push(
      `improvement ${improvementOverBaseline.toFixed(2)} < ${MIN_IMPROVEMENT.toFixed(2)}`,
    );
  }

  return {
    status: failureReasons.length > 0 ? "fail" : "pass",
    accuracy: roundMetric(accuracy),
    majorityBaseline: roundMetric(majorityBaseline),
    improvementOverBaseline: roundMetric(improvementOverBaseline),
    evaluatedSamples,
    warmupSamples,
    labelCoverage: coverage,
    failureReasons,
  };
}
