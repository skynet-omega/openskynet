import type {
  SkynetCausalContinuityFreshness,
  SkynetCausalEpisode,
  SkynetCausalValenceLabel,
} from "./episode-ledger.js";
import { deriveSkynetWorldTransitionFeatures } from "./world-transition.js";

export type SkynetCausalValenceModel = {
  labels: SkynetCausalValenceLabel[];
  centroids: Record<SkynetCausalValenceLabel, number[]>;
  counts: Record<SkynetCausalValenceLabel, number>;
};

export type SkynetCausalPrediction = {
  label: SkynetCausalValenceLabel;
  scores: Record<SkynetCausalValenceLabel, number>;
};

const LABELS: SkynetCausalValenceLabel[] = ["progress", "relief", "stall", "frustration", "damage"];

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function encodeFreshness(freshness: SkynetCausalContinuityFreshness): number[] {
  return [
    freshness === "fresh" ? 1 : 0,
    freshness === "aging" ? 1 : 0,
    freshness === "stale" ? 1 : 0,
    freshness === "missing" ? 1 : 0,
  ];
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function encodeSkynetCausalEpisodeFeatures(episode: SkynetCausalEpisode): number[] {
  const transition = deriveSkynetWorldTransitionFeatures(episode.transition);
  return [
    ...encodeFreshness(episode.context.continuityFreshness),
    clamp01(Math.min(episode.context.failureStreak, 4) / 4),
    clamp01(Math.min(episode.context.targetCount, 8) / 8),
    clamp01(episode.context.validationIntensity),
    clamp01(Math.min(transition.operationCount, 8) / 8),
    clamp01(Math.min(transition.uniquePathCount, 8) / 8),
    transition.createRatio,
    transition.editRatio,
    transition.deleteRatio,
    transition.renameRatio,
    transition.noopRatio,
    transition.targetCoverage,
    transition.collateralRatio,
  ];
}

export function trainSkynetCausalValenceModel(
  episodes: SkynetCausalEpisode[],
): SkynetCausalValenceModel | null {
  if (episodes.length === 0) {
    return null;
  }
  const vectorLength = encodeSkynetCausalEpisodeFeatures(episodes[0]).length;
  const sums = LABELS.reduce(
    (acc, label) => {
      acc[label] = new Array<number>(vectorLength).fill(0);
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

  for (const episode of episodes) {
    const vector = encodeSkynetCausalEpisodeFeatures(episode);
    counts[episode.bootstrapLabel] += 1;
    for (let i = 0; i < vector.length; i += 1) {
      sums[episode.bootstrapLabel][i] += vector[i] ?? 0;
    }
  }

  const centroids = LABELS.reduce(
    (acc, label) => {
      const count = counts[label];
      acc[label] =
        count > 0
          ? sums[label].map((value) => value / count)
          : new Array<number>(vectorLength).fill(0);
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

export function predictSkynetCausalValence(
  model: SkynetCausalValenceModel,
  episode: SkynetCausalEpisode,
): SkynetCausalPrediction {
  const vector = encodeSkynetCausalEpisodeFeatures(episode);
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
        (a, b) => (scores[b] ?? Number.NEGATIVE_INFINITY) - (scores[a] ?? Number.NEGATIVE_INFINITY),
      )
      .at(0) ?? "stall";
  return { label, scores };
}
