import type { SkynetCausalValenceLabel } from "../causal-valence/episode-ledger.js";
import {
  encodeSkynetRuntimeTrajectoryFeatures,
  type SkynetRuntimeTrajectorySample,
} from "./trajectory-builder.js";

export type SkynetRuntimeObserverModel = {
  labels: SkynetCausalValenceLabel[];
  centroids: Record<SkynetCausalValenceLabel, number[]>;
  counts: Record<SkynetCausalValenceLabel, number>;
};

export type SkynetRuntimeObserverPrediction = {
  label: SkynetCausalValenceLabel;
  scores: Record<SkynetCausalValenceLabel, number>;
};

const LABELS: SkynetCausalValenceLabel[] = ["progress", "relief", "stall", "frustration", "damage"];

function zeroVector(length: number): number[] {
  return Array.from({ length }, () => 0);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    const av = a[index] ?? 0;
    const bv = b[index] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function trainSkynetRuntimeObserverModel(
  samples: SkynetRuntimeTrajectorySample[],
): SkynetRuntimeObserverModel | null {
  if (samples.length === 0) {
    return null;
  }
  const vectorLength = encodeSkynetRuntimeTrajectoryFeatures(samples[0]).length;
  const sums = LABELS.reduce(
    (acc, label) => {
      acc[label] = zeroVector(vectorLength);
      return acc;
    },
    {} as Record<SkynetCausalValenceLabel, number[]>,
  );
  const counts = LABELS.reduce(
    (acc, label) => {
      acc[label] = 0;
      return acc;
    },
    {} as Record<SkynetCausalValenceLabel, number>,
  );

  for (const sample of samples) {
    const vector = encodeSkynetRuntimeTrajectoryFeatures(sample);
    counts[sample.targetLabel] += 1;
    for (let index = 0; index < vector.length; index += 1) {
      sums[sample.targetLabel][index] += vector[index] ?? 0;
    }
  }

  const centroids = LABELS.reduce(
    (acc, label) => {
      const count = counts[label];
      acc[label] = count > 0 ? sums[label].map((value) => value / count) : zeroVector(vectorLength);
      return acc;
    },
    {} as Record<SkynetCausalValenceLabel, number[]>,
  );

  return {
    labels: LABELS.filter((label) => counts[label] > 0),
    centroids,
    counts,
  };
}

export function predictSkynetRuntimeObserverLabel(
  model: SkynetRuntimeObserverModel,
  sample: SkynetRuntimeTrajectorySample,
): SkynetRuntimeObserverPrediction {
  const vector = encodeSkynetRuntimeTrajectoryFeatures(sample);
  const scores = model.labels.reduce(
    (acc, label) => {
      acc[label] = cosineSimilarity(vector, model.centroids[label]);
      return acc;
    },
    {} as Record<SkynetCausalValenceLabel, number>,
  );
  const label =
    model.labels
      .slice()
      .sort(
        (left, right) =>
          (scores[right] ?? Number.NEGATIVE_INFINITY) - (scores[left] ?? Number.NEGATIVE_INFINITY),
      )
      .at(0) ?? "stall";
  return { label, scores };
}
