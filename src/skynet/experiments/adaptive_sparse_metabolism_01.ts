import fs from "node:fs/promises";
import path from "node:path";
import { SparseMetabolism, type ComponentType } from "../../omega/sparse-metabolism.js";

type TraceStep = {
  latentFrustration: number;
  observedFrustration: number;
};

type RunResult = {
  seed: number;
  ruleAccuracy: number;
  adaptiveAccuracy: number;
  ruleFalsePositiveRate: number;
  adaptiveFalsePositiveRate: number;
  ruleMetabolicError: number;
  adaptiveMetabolicError: number;
  delta: number;
};

const COMPONENTS: ComponentType[] = [
  "neural_logic_engine",
  "hierarchical_memory",
  "lyapunov_controller",
  "causal_reasoner",
  "autonomy_logger",
  "jepa_enhancer",
];

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number, mean = 0, std = 1): number {
  const u1 = Math.max(rand(), 1e-7);
  const u2 = Math.max(rand(), 1e-7);
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z0 * std;
}

function generateTrace(seed: number, length: number): TraceStep[] {
  const rand = mulberry32(seed);
  const trace: TraceStep[] = [];
  let latent = 0.18 + rand() * 0.1;

  for (let i = 0; i < length; i += 1) {
    const shock =
      rand() < 0.08 ? (rand() < 0.5 ? -0.35 : 0.35) : rand() < 0.16 ? gaussian(rand, 0, 0.18) : 0;
    const drift = gaussian(rand, 0, 0.05);
    latent = clamp01(latent * 0.82 + 0.12 + drift + shock);
    const observed = clamp01(latent + gaussian(rand, 0, 0.12));
    trace.push({
      latentFrustration: latent,
      observedFrustration: observed,
    });
  }

  return trace;
}

function classifyAdaptiveFrustration(params: {
  priorEffective?: number;
  priorObserved?: number;
  observed: number;
}): { effective: number; retention: number } {
  const priorEffective = params.priorEffective ?? params.observed;
  const priorObserved = params.priorObserved ?? params.observed;
  const flux = Math.abs(params.observed - priorObserved);
  const modulation = 1 / (1 + Math.exp(-(flux - 0.12) * 10));
  const retention = clamp01(Math.max(0.58, Math.min(0.96, 0.9 - modulation * 0.28)));
  return {
    effective: clamp01(retention * priorEffective + (1 - retention) * params.observed),
    retention,
  };
}

function stateForFrustration(metabolism: SparseMetabolism, frustration: number) {
  return metabolism.computeMetabolism(frustration);
}

function stepAccuracy(predicted: Set<ComponentType>, expected: Set<ComponentType>): number {
  let correct = 0;
  for (const component of COMPONENTS) {
    correct += Number(predicted.has(component) === expected.has(component));
  }
  return correct / COMPONENTS.length;
}

function evaluateTrace(trace: TraceStep[]): {
  ruleAccuracy: number;
  adaptiveAccuracy: number;
  ruleFalsePositiveRate: number;
  adaptiveFalsePositiveRate: number;
  ruleMetabolicError: number;
  adaptiveMetabolicError: number;
} {
  const expectedMetabolism = new SparseMetabolism();
  const ruleMetabolism = new SparseMetabolism();
  const adaptiveMetabolism = new SparseMetabolism();
  let adaptiveEffective: number | undefined;
  let adaptiveObserved: number | undefined;
  let ruleAccuracy = 0;
  let adaptiveAccuracy = 0;
  let ruleFalsePositives = 0;
  let adaptiveFalsePositives = 0;
  let expectedInactiveCount = 0;
  let ruleMetabolicError = 0;
  let adaptiveMetabolicError = 0;

  for (const step of trace) {
    const expectedState = stateForFrustration(expectedMetabolism, step.latentFrustration);
    const expected = new Set(expectedState.activatedComponents);
    const ruleState = stateForFrustration(ruleMetabolism, step.observedFrustration);
    const rule = new Set(ruleState.activatedComponents);
    const adaptiveFrustration = classifyAdaptiveFrustration({
      priorEffective: adaptiveEffective,
      priorObserved: adaptiveObserved,
      observed: step.observedFrustration,
    });
    adaptiveEffective = adaptiveFrustration.effective;
    adaptiveObserved = step.observedFrustration;
    const adaptiveState = stateForFrustration(adaptiveMetabolism, adaptiveFrustration.effective);
    const adaptive = new Set(adaptiveState.activatedComponents);

    ruleAccuracy += stepAccuracy(rule, expected);
    adaptiveAccuracy += stepAccuracy(adaptive, expected);
    ruleMetabolicError += Math.abs(ruleState.totalMetabolicRate - expectedState.totalMetabolicRate);
    adaptiveMetabolicError += Math.abs(
      adaptiveState.totalMetabolicRate - expectedState.totalMetabolicRate,
    );

    for (const component of COMPONENTS) {
      const expectedActive = expected.has(component);
      if (!expectedActive) {
        expectedInactiveCount += 1;
        ruleFalsePositives += Number(rule.has(component));
        adaptiveFalsePositives += Number(adaptive.has(component));
      }
    }
  }

  return {
    ruleAccuracy: ruleAccuracy / trace.length,
    adaptiveAccuracy: adaptiveAccuracy / trace.length,
    ruleFalsePositiveRate: ruleFalsePositives / Math.max(1, expectedInactiveCount),
    adaptiveFalsePositiveRate: adaptiveFalsePositives / Math.max(1, expectedInactiveCount),
    ruleMetabolicError: ruleMetabolicError / trace.length,
    adaptiveMetabolicError: adaptiveMetabolicError / trace.length,
  };
}

async function main() {
  const seeds = [101, 202, 303, 404, 505];
  const results: RunResult[] = [];

  for (const seed of seeds) {
    const trace = generateTrace(seed, 240);
    const result = evaluateTrace(trace);
    results.push({
      seed,
      ruleAccuracy: result.ruleAccuracy,
      adaptiveAccuracy: result.adaptiveAccuracy,
      ruleFalsePositiveRate: result.ruleFalsePositiveRate,
      adaptiveFalsePositiveRate: result.adaptiveFalsePositiveRate,
      ruleMetabolicError: result.ruleMetabolicError,
      adaptiveMetabolicError: result.adaptiveMetabolicError,
      delta: result.adaptiveAccuracy - result.ruleAccuracy,
    });
  }

  const report = {
    experiment: "adaptive_sparse_metabolism_01",
    runs: results,
    meanRuleAccuracy: results.reduce((sum, run) => sum + run.ruleAccuracy, 0) / results.length,
    meanAdaptiveAccuracy:
      results.reduce((sum, run) => sum + run.adaptiveAccuracy, 0) / results.length,
    meanRuleFalsePositiveRate:
      results.reduce((sum, run) => sum + run.ruleFalsePositiveRate, 0) / results.length,
    meanAdaptiveFalsePositiveRate:
      results.reduce((sum, run) => sum + run.adaptiveFalsePositiveRate, 0) / results.length,
    meanRuleMetabolicError:
      results.reduce((sum, run) => sum + run.ruleMetabolicError, 0) / results.length,
    meanAdaptiveMetabolicError:
      results.reduce((sum, run) => sum + run.adaptiveMetabolicError, 0) / results.length,
    meanDelta: results.reduce((sum, run) => sum + run.delta, 0) / results.length,
  };

  const outputPath = path.join(
    process.cwd(),
    ".openskynet",
    "skynet-experiments",
    "adaptive_sparse_metabolism_01.json",
  );
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2), "utf-8");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

await main();
