import type { SkynetCausalEpisode, SkynetCausalValenceLabel } from "./episode-ledger.js";
import { trainSkynetCausalValenceModel, predictSkynetCausalValence } from "./valence-learner.js";

export type SkynetCausalValenceBenchmark = {
  status: "pass" | "fail" | "insufficient_data";
  accuracy: number;
  majorityBaseline: number;
  improvementOverBaseline: number;
  evaluatedEpisodes: number;
  labelCoverage: Partial<Record<SkynetCausalValenceLabel, number>>;
  failureReasons: string[];
};

const MIN_EPISODES = 12;
const MIN_LABELS = 3;
const MIN_LABEL_COUNT = 2;
const MIN_ACCURACY = 0.55;
const MIN_IMPROVEMENT = 0.12;

function roundMetric(value: number): number {
  return Number(value.toFixed(4));
}

function deriveLabelCoverage(
  episodes: SkynetCausalEpisode[],
): Partial<Record<SkynetCausalValenceLabel, number>> {
  const coverage: Partial<Record<SkynetCausalValenceLabel, number>> = {};
  for (const episode of episodes) {
    coverage[episode.bootstrapLabel] = (coverage[episode.bootstrapLabel] ?? 0) + 1;
  }
  return coverage;
}

function deriveMajorityBaseline(
  coverage: Partial<Record<SkynetCausalValenceLabel, number>>,
  total: number,
): number {
  const majority = Object.values(coverage).reduce((max, count) => Math.max(max, count ?? 0), 0);
  return total > 0 ? majority / total : 0;
}

export function runSkynetCausalValenceBenchmark(
  episodes: SkynetCausalEpisode[],
): SkynetCausalValenceBenchmark {
  const coverage = deriveLabelCoverage(episodes);
  const distinctLabels = Object.values(coverage).filter(
    (count) => (count ?? 0) >= MIN_LABEL_COUNT,
  ).length;
  const baseline = deriveMajorityBaseline(coverage, episodes.length);
  const failureReasons: string[] = [];

  if (episodes.length < MIN_EPISODES) {
    failureReasons.push(`need at least ${MIN_EPISODES} episodes`);
  }
  if (distinctLabels < MIN_LABELS) {
    failureReasons.push(`need at least ${MIN_LABELS} labels with >=${MIN_LABEL_COUNT} samples`);
  }
  if (failureReasons.length > 0) {
    return {
      status: "insufficient_data",
      accuracy: 0,
      majorityBaseline: roundMetric(baseline),
      improvementOverBaseline: roundMetric(-baseline),
      evaluatedEpisodes: 0,
      labelCoverage: coverage,
      failureReasons,
    };
  }

  let correct = 0;
  let evaluated = 0;
  for (let i = 0; i < episodes.length; i += 1) {
    const testEpisode = episodes[i];
    const trainEpisodes = episodes.filter((_, index) => index !== i);
    const model = trainSkynetCausalValenceModel(trainEpisodes);
    if (!model || !model.labels.includes(testEpisode.bootstrapLabel)) {
      continue;
    }
    const prediction = predictSkynetCausalValence(model, testEpisode);
    evaluated += 1;
    if (prediction.label === testEpisode.bootstrapLabel) {
      correct += 1;
    }
  }

  const accuracy = evaluated > 0 ? correct / evaluated : 0;
  const improvementOverBaseline = accuracy - baseline;

  if (evaluated === 0) {
    failureReasons.push("benchmark produced zero evaluable episodes");
    return {
      status: "insufficient_data",
      accuracy: 0,
      majorityBaseline: roundMetric(baseline),
      improvementOverBaseline: roundMetric(-baseline),
      evaluatedEpisodes: 0,
      labelCoverage: coverage,
      failureReasons,
    };
  }

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
    majorityBaseline: roundMetric(baseline),
    improvementOverBaseline: roundMetric(improvementOverBaseline),
    evaluatedEpisodes: evaluated,
    labelCoverage: coverage,
    failureReasons,
  };
}
