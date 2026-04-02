import type { SkynetCausalValenceLabel } from "../causal-valence/episode-ledger.js";
import {
  encodeSkynetRuntimeTrajectoryFeatures,
  type SkynetRuntimeTrajectorySample,
} from "../runtime-observer/trajectory-builder.js";

const LABELS: SkynetCausalValenceLabel[] = ["progress", "relief", "stall", "frustration", "damage"];
const DEFAULT_RETENTION = 0.72;
const DEFAULT_TRANSITION_WEIGHT = 0.18;
const DEFAULT_SURPRISE_WEIGHT = 0.12;

export type SkynetCognitiveKernelConfig = {
  latentRetention: number;
  transitionWeight: number;
  surpriseWeight: number;
};

export type SkynetCognitiveKernelState = {
  labels: SkynetCausalValenceLabel[];
  latent: number[];
  featureDimensions: number;
  config: SkynetCognitiveKernelConfig;
  prototypeCounts: Record<SkynetCausalValenceLabel, number>;
  prototypes: Record<SkynetCausalValenceLabel, number[]>;
  transitionCounts: Record<SkynetCausalValenceLabel, Record<SkynetCausalValenceLabel, number>>;
  observedCount: number;
  lastObservedLabel?: SkynetCausalValenceLabel;
  seenSampleIds?: string[];
};

export type SkynetCognitiveKernelPrediction = {
  label: SkynetCausalValenceLabel;
  scores: Record<SkynetCausalValenceLabel, number>;
  surprise: number;
};

function zeroVector(length: number): number[] {
  return Array.from({ length }, () => 0);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalize(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) {
    return zeroVector(vector.length);
  }
  return vector.map((value) => value / magnitude);
}

function cosineSimilarity(left: number[], right: number[]): number {
  let dot = 0;
  let normLeft = 0;
  let normRight = 0;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const l = left[index] ?? 0;
    const r = right[index] ?? 0;
    dot += l * r;
    normLeft += l * l;
    normRight += r * r;
  }
  if (normLeft === 0 || normRight === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normLeft) * Math.sqrt(normRight));
}

function blend(left: number[], right: number[], retention: number): number[] {
  return left.map((value, index) => value * retention + (right[index] ?? 0) * (1 - retention));
}

function estimateTransitionPrior(
  state: SkynetCognitiveKernelState,
  previousLabel: SkynetCausalValenceLabel | undefined,
  label: SkynetCausalValenceLabel,
): number {
  if (!previousLabel) {
    return 0;
  }
  const row = state.transitionCounts[previousLabel];
  const total = Object.values(row).reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return 0;
  }
  return (row[label] ?? 0) / total;
}

function lastHistoryLabel(
  sample: SkynetRuntimeTrajectorySample,
): SkynetCausalValenceLabel | undefined {
  return sample.historyEpisodes.at(-1)?.bootstrapLabel;
}

export function createSkynetCognitiveKernelState(params: {
  featureDimensions: number;
  config?: Partial<SkynetCognitiveKernelConfig>;
}): SkynetCognitiveKernelState {
  const featureDimensions = Math.max(1, Math.round(params.featureDimensions));
  return {
    labels: LABELS,
    latent: zeroVector(featureDimensions),
    featureDimensions,
    config: {
      latentRetention: clamp01(params.config?.latentRetention ?? DEFAULT_RETENTION),
      transitionWeight: clamp01(params.config?.transitionWeight ?? DEFAULT_TRANSITION_WEIGHT),
      surpriseWeight: clamp01(params.config?.surpriseWeight ?? DEFAULT_SURPRISE_WEIGHT),
    },
    prototypeCounts: LABELS.reduce(
      (acc, label) => {
        acc[label] = 0;
        return acc;
      },
      {} as Record<SkynetCausalValenceLabel, number>,
    ),
    prototypes: LABELS.reduce(
      (acc, label) => {
        acc[label] = zeroVector(featureDimensions);
        return acc;
      },
      {} as Record<SkynetCausalValenceLabel, number[]>,
    ),
    transitionCounts: LABELS.reduce(
      (acc, fromLabel) => {
        acc[fromLabel] = LABELS.reduce(
          (row, toLabel) => {
            row[toLabel] = 0;
            return row;
          },
          {} as Record<SkynetCausalValenceLabel, number>,
        );
        return acc;
      },
      {} as Record<SkynetCausalValenceLabel, Record<SkynetCausalValenceLabel, number>>,
    ),
    observedCount: 0,
    seenSampleIds: [],
  };
}

export function observeSkynetCognitiveKernelSample(
  state: SkynetCognitiveKernelState,
  sample: SkynetRuntimeTrajectorySample,
): SkynetCognitiveKernelState {
  const vector = normalize(encodeSkynetRuntimeTrajectoryFeatures(sample));
  if (vector.length !== state.featureDimensions) {
    throw new Error(
      `feature dimension mismatch: expected ${state.featureDimensions}, got ${vector.length}`,
    );
  }

  const previousLabel = state.lastObservedLabel ?? lastHistoryLabel(sample);
  const nextLatent =
    state.observedCount === 0
      ? vector
      : normalize(blend(state.latent, vector, state.config.latentRetention));

  const label = sample.targetLabel;
  const count = state.prototypeCounts[label];
  const prototypeRetention = count <= 0 ? 0 : count / (count + 1);
  const updatedPrototype =
    count <= 0 ? vector : normalize(blend(state.prototypes[label], vector, prototypeRetention));

  const transitionCounts = {
    ...state.transitionCounts,
    ...(previousLabel
      ? {
          [previousLabel]: {
            ...state.transitionCounts[previousLabel],
            [label]: (state.transitionCounts[previousLabel][label] ?? 0) + 1,
          },
        }
      : {}),
  };

  return {
    ...state,
    latent: nextLatent,
    observedCount: state.observedCount + 1,
    lastObservedLabel: label,
    seenSampleIds: [...(state.seenSampleIds ?? []), sample.id].slice(-4096),
    prototypeCounts: {
      ...state.prototypeCounts,
      [label]: count + 1,
    },
    prototypes: {
      ...state.prototypes,
      [label]: updatedPrototype,
    },
    transitionCounts,
  };
}

export function updateSkynetCognitiveKernelState(params: {
  state: SkynetCognitiveKernelState;
  samples: SkynetRuntimeTrajectorySample[];
}): {
  state: SkynetCognitiveKernelState;
  ingestedCount: number;
  skippedCount: number;
} {
  let next = params.state;
  let ingestedCount = 0;
  let skippedCount = 0;
  const seen = new Set(next.seenSampleIds ?? []);
  for (const sample of params.samples) {
    if (seen.has(sample.id)) {
      skippedCount += 1;
      continue;
    }
    next = observeSkynetCognitiveKernelSample(next, sample);
    seen.add(sample.id);
    ingestedCount += 1;
  }
  return {
    state: {
      ...next,
      seenSampleIds: [...seen].slice(-4096),
    },
    ingestedCount,
    skippedCount,
  };
}

export function predictSkynetCognitiveKernelLabel(
  state: SkynetCognitiveKernelState,
  sample: SkynetRuntimeTrajectorySample,
): SkynetCognitiveKernelPrediction {
  const vector = normalize(encodeSkynetRuntimeTrajectoryFeatures(sample));
  const previousLabel = state.lastObservedLabel ?? lastHistoryLabel(sample);
  const latentAlignment =
    state.observedCount > 0 ? clamp01((cosineSimilarity(vector, state.latent) + 1) / 2) : 0;
  const scores = LABELS.reduce(
    (acc, label) => {
      const hasPrototype = state.prototypeCounts[label] > 0;
      const similarity = hasPrototype
        ? clamp01((cosineSimilarity(vector, state.prototypes[label]) + 1) / 2)
        : 0;
      const transitionPrior = estimateTransitionPrior(state, previousLabel, label);
      acc[label] =
        similarity * (1 - state.config.transitionWeight - state.config.surpriseWeight) +
        transitionPrior * state.config.transitionWeight +
        latentAlignment * state.config.surpriseWeight;
      return acc;
    },
    {} as Record<SkynetCausalValenceLabel, number>,
  );

  const label =
    LABELS.slice()
      .sort((left, right) => (scores[right] ?? 0) - (scores[left] ?? 0))
      .at(0) ?? "stall";
  const bestPrototypeSimilarity =
    LABELS.reduce((best, candidate) => {
      if (state.prototypeCounts[candidate] <= 0) {
        return best;
      }
      const similarity = clamp01((cosineSimilarity(vector, state.prototypes[candidate]) + 1) / 2);
      return Math.max(best, similarity);
    }, 0) ?? 0;

  return {
    label,
    scores,
    surprise: clamp01(1 - bestPrototypeSimilarity),
  };
}

export function replaySkynetCognitiveKernelState(params: {
  samples: SkynetRuntimeTrajectorySample[];
  config?: Partial<SkynetCognitiveKernelConfig>;
}): SkynetCognitiveKernelState | null {
  if (params.samples.length === 0) {
    return null;
  }
  let state = createSkynetCognitiveKernelState({
    featureDimensions: encodeSkynetRuntimeTrajectoryFeatures(params.samples[0]).length,
    config: params.config,
  });
  for (const sample of params.samples) {
    state = observeSkynetCognitiveKernelSample(state, sample);
  }
  return state;
}
