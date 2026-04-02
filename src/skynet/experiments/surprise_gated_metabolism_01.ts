import fs from "node:fs/promises";
import path from "node:path";
import { SparseMetabolism, type ComponentType } from "../../omega/sparse-metabolism.js";

type TraceStep = {
  latentFrustration: number;
  latentDelta: number;
  observedFrustration: number;
  observedDelta: number;
};

type RunResult = {
  seed: number;
  legacyAccuracy: number;
  integratedAccuracy: number;
  legacyFalsePositiveRate: number;
  integratedFalsePositiveRate: number;
  legacyMetabolicError: number;
  integratedMetabolicError: number;
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
  let latent = 0.2 + rand() * 0.08;
  let observedPrev = latent;

  for (let i = 0; i < length; i += 1) {
    const shock =
      rand() < 0.06 ? (rand() < 0.5 ? -0.32 : 0.32) : rand() < 0.14 ? gaussian(rand, 0, 0.15) : 0;
    const drift = gaussian(rand, 0, 0.04);
    const nextLatent = clamp01(latent * 0.84 + 0.1 + drift + shock);
    const latentDelta = nextLatent - latent;
    latent = nextLatent;
    const observed = clamp01(latent + gaussian(rand, 0, 0.11));
    const observedDelta = observed - observedPrev;
    observedPrev = observed;
    trace.push({
      latentFrustration: latent,
      latentDelta,
      observedFrustration: observed,
      observedDelta,
    });
  }

  return trace;
}

function expectedActiveSet(step: TraceStep): Set<ComponentType> {
  const active = new Set<ComponentType>(["neural_logic_engine", "autonomy_logger"]);
  if (step.latentFrustration > 0.45 || (step.latentFrustration > 0.28 && step.latentDelta > 0.1)) {
    active.add("hierarchical_memory");
  }
  if (step.latentFrustration > 0.3 || Math.abs(step.latentDelta) > 0.18) {
    active.add("lyapunov_controller");
  }
  if (
    (step.latentFrustration > 0.65 && step.latentDelta > -0.05) ||
    step.latentFrustration > 0.82
  ) {
    active.add("causal_reasoner");
  }
  if (step.latentFrustration > 0.22 || step.latentDelta > 0.08) {
    active.add("jepa_enhancer");
  }
  return active;
}

const LEGACY_THRESHOLDS: Record<ComponentType, number> = {
  neural_logic_engine: 0.0,
  hierarchical_memory: 0.4,
  lyapunov_controller: 0.3,
  causal_reasoner: 0.6,
  autonomy_logger: 0.0,
  jepa_enhancer: 0.2,
};

function legacyActiveSet(frustration: number): Set<ComponentType> {
  const active = new Set<ComponentType>();
  for (const component of COMPONENTS) {
    if (frustration >= LEGACY_THRESHOLDS[component]) {
      active.add(component);
    }
  }
  return active;
}

function estimateMetabolicRate(active: Set<ComponentType>): number {
  return active.size / COMPONENTS.length;
}

function stepAccuracy(predicted: Set<ComponentType>, expected: Set<ComponentType>): number {
  let correct = 0;
  for (const component of COMPONENTS) {
    correct += Number(predicted.has(component) === expected.has(component));
  }
  return correct / COMPONENTS.length;
}

function evaluateTrace(trace: TraceStep[]) {
  const integrated = new SparseMetabolism();
  let legacyAccuracy = 0;
  let integratedAccuracy = 0;
  let legacyFalsePositives = 0;
  let integratedFalsePositives = 0;
  let expectedInactiveCount = 0;
  let legacyMetabolicError = 0;
  let integratedMetabolicError = 0;

  for (const step of trace) {
    const expected = expectedActiveSet(step);
    const legacySet = legacyActiveSet(step.observedFrustration);
    const integratedSet = new Set(
      integrated.computeMetabolism(step.observedFrustration).activatedComponents,
    );

    legacyAccuracy += stepAccuracy(legacySet, expected);
    integratedAccuracy += stepAccuracy(integratedSet, expected);
    legacyMetabolicError += Math.abs(
      estimateMetabolicRate(legacySet) - estimateMetabolicRate(expected),
    );
    integratedMetabolicError += Math.abs(
      estimateMetabolicRate(integratedSet) - estimateMetabolicRate(expected),
    );

    for (const component of COMPONENTS) {
      const expectedActive = expected.has(component);
      if (!expectedActive) {
        expectedInactiveCount += 1;
        legacyFalsePositives += Number(legacySet.has(component));
        integratedFalsePositives += Number(integratedSet.has(component));
      }
    }
  }

  return {
    legacyAccuracy: legacyAccuracy / trace.length,
    integratedAccuracy: integratedAccuracy / trace.length,
    legacyFalsePositiveRate: legacyFalsePositives / Math.max(1, expectedInactiveCount),
    integratedFalsePositiveRate: integratedFalsePositives / Math.max(1, expectedInactiveCount),
    legacyMetabolicError: legacyMetabolicError / trace.length,
    integratedMetabolicError: integratedMetabolicError / trace.length,
  };
}

async function main() {
  const seeds = [101, 202, 303, 404, 505];
  const runs: RunResult[] = [];

  for (const seed of seeds) {
    const trace = generateTrace(seed, 240);
    const result = evaluateTrace(trace);
    runs.push({
      seed,
      ...result,
      delta: result.integratedAccuracy - result.legacyAccuracy,
    });
  }

  const report = {
    experiment: "surprise_gated_metabolism_01",
    runs,
    meanLegacyAccuracy: runs.reduce((sum, run) => sum + run.legacyAccuracy, 0) / runs.length,
    meanIntegratedAccuracy:
      runs.reduce((sum, run) => sum + run.integratedAccuracy, 0) / runs.length,
    meanLegacyFalsePositiveRate:
      runs.reduce((sum, run) => sum + run.legacyFalsePositiveRate, 0) / runs.length,
    meanIntegratedFalsePositiveRate:
      runs.reduce((sum, run) => sum + run.integratedFalsePositiveRate, 0) / runs.length,
    meanLegacyMetabolicError:
      runs.reduce((sum, run) => sum + run.legacyMetabolicError, 0) / runs.length,
    meanIntegratedMetabolicError:
      runs.reduce((sum, run) => sum + run.integratedMetabolicError, 0) / runs.length,
    meanDelta: runs.reduce((sum, run) => sum + run.delta, 0) / runs.length,
  };

  const outputPath = path.join(
    process.cwd(),
    ".openskynet",
    "skynet-experiments",
    "surprise_gated_metabolism_01.json",
  );
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2), "utf-8");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

await main();
