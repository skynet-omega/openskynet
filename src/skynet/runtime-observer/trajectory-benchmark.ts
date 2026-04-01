import type { SkynetCausalValenceLabel } from "../causal-valence/episode-ledger.js";
import type { SkynetRuntimeTrajectorySample } from "./trajectory-builder.js";
import {
  predictSkynetRuntimeObserverLabel,
  trainSkynetRuntimeObserverModel,
} from "./trajectory-learner.js";

export type SkynetRuntimeObserverBenchmark = {
  status: "pass" | "fail" | "insufficient_data";
  accuracy: number;
  majorityBaseline: number;
  improvementOverBaseline: number;
  evaluatedSamples: number;
  labelCoverage: Partial<Record<SkynetCausalValenceLabel, number>>;
  failureReasons: string[];
};

const MIN_SAMPLES = 24;
const MIN_LABELS = 3;
const MIN_LABEL_COUNT = 3;
const MIN_ACCURACY = 0.5;
const MIN_IMPROVEMENT = 0.08;

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

function deriveMajorityBaseline(
  coverage: Partial<Record<SkynetCausalValenceLabel, number>>,
  total: number,
): number {
  const majority = Object.values(coverage).reduce((max, count) => Math.max(max, count ?? 0), 0);
  return total > 0 ? majority / total : 0;
}

export function runSkynetRuntimeObserverBenchmark(
  samples: SkynetRuntimeTrajectorySample[],
): SkynetRuntimeObserverBenchmark {
  const coverage = deriveLabelCoverage(samples);
  const distinctLabels = Object.values(coverage).filter(
    (count) => (count ?? 0) >= MIN_LABEL_COUNT,
  ).length;
  const baseline = deriveMajorityBaseline(coverage, samples.length);
  const failureReasons: string[] = [];

  if (samples.length < MIN_SAMPLES) {
    failureReasons.push(`need at least ${MIN_SAMPLES} samples`);
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
      evaluatedSamples: 0,
      labelCoverage: coverage,
      failureReasons,
    };
  }

  let evaluated = 0;
  let correct = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const testSample = samples[index];
    const trainSamples = samples.filter((_, candidateIndex) => candidateIndex !== index);
    const model = trainSkynetRuntimeObserverModel(trainSamples);
    if (!model || !model.labels.includes(testSample.targetLabel)) {
      continue;
    }
    const prediction = predictSkynetRuntimeObserverLabel(model, testSample);
    evaluated += 1;
    if (prediction.label === testSample.targetLabel) {
      correct += 1;
    }
  }

  const accuracy = evaluated > 0 ? correct / evaluated : 0;
  const improvementOverBaseline = accuracy - baseline;
  if (evaluated === 0) {
    return {
      status: "insufficient_data",
      accuracy: 0,
      majorityBaseline: roundMetric(baseline),
      improvementOverBaseline: roundMetric(-baseline),
      evaluatedSamples: 0,
      labelCoverage: coverage,
      failureReasons: ["benchmark produced zero evaluable samples"],
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
    evaluatedSamples: evaluated,
    labelCoverage: coverage,
    failureReasons,
  };
}
