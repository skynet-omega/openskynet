import fs from "node:fs/promises";
import path from "node:path";
import {
  deriveAdaptiveContinuitySnapshot,
  deriveRuleContinuityScore,
} from "../adaptive-continuity.js";

type Sample = {
  hiddenStable: boolean;
  steps: Array<{
    focusStreak: number;
    retainedRatio: number;
    sameMode: boolean;
    modeShiftCount: number;
  }>;
};

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function jitter(rand: () => number, min: number, max: number): number {
  return min + (max - min) * rand();
}

function buildSample(rand: () => number): Sample {
  const hiddenStable = rand() > 0.5;
  const steps: Sample["steps"] = [];
  let modeShiftCount = 0;

  if (hiddenStable) {
    const initialStreak = 2 + Math.floor(rand() * 2);
    steps.push({
      focusStreak: initialStreak,
      retainedRatio: jitter(rand, 0.85, 1),
      sameMode: true,
      modeShiftCount,
    });
    steps.push({
      focusStreak: initialStreak + 1,
      retainedRatio: jitter(rand, 0.82, 0.96),
      sameMode: true,
      modeShiftCount,
    });
    modeShiftCount += 1;
    steps.push({
      focusStreak: 1,
      retainedRatio: jitter(rand, 0.4, 0.58),
      sameMode: false,
      modeShiftCount,
    });
  } else {
    steps.push({
      focusStreak: 2,
      retainedRatio: jitter(rand, 0.78, 0.9),
      sameMode: true,
      modeShiftCount,
    });
    modeShiftCount += 1;
    steps.push({
      focusStreak: 1,
      retainedRatio: jitter(rand, 0.38, 0.55),
      sameMode: false,
      modeShiftCount,
    });
    modeShiftCount += 1;
    steps.push({
      focusStreak: 1,
      retainedRatio: jitter(rand, 0.3, 0.48),
      sameMode: false,
      modeShiftCount,
    });
  }

  return { hiddenStable, steps };
}

function evaluateSequence(samples: Sample[]) {
  let ruleCorrect = 0;
  let adaptiveCorrect = 0;

  for (const sample of samples) {
    let prior:
      | {
          ruleContinuityScore?: number;
          adaptiveContinuityScore?: number;
          adaptiveRetention?: number;
        }
      | undefined;
    let finalAdaptive = 0;

    for (const step of sample.steps) {
      const next = deriveAdaptiveContinuitySnapshot({
        inputs: step,
        prior,
      });
      finalAdaptive = next.adaptiveContinuityScore;
      prior = next;
    }

    const finalStep = sample.steps[sample.steps.length - 1];
    const finalRule = deriveRuleContinuityScore(finalStep);
    const ruleStable = finalRule >= 0.55;
    const adaptiveStable = finalAdaptive >= 0.55;

    ruleCorrect += Number(ruleStable === sample.hiddenStable);
    adaptiveCorrect += Number(adaptiveStable === sample.hiddenStable);
  }

  return {
    ruleAccuracy: ruleCorrect / samples.length,
    adaptiveAccuracy: adaptiveCorrect / samples.length,
    delta: adaptiveCorrect / samples.length - ruleCorrect / samples.length,
  };
}

async function main() {
  const seeds = [101, 202, 303, 404, 505];
  const runs = [];

  for (const seed of seeds) {
    const rand = mulberry32(seed);
    const samples = Array.from({ length: 256 }, () => buildSample(rand));
    runs.push({
      seed,
      ...evaluateSequence(samples),
    });
  }

  const report = {
    experiment: "adaptive_continuity_01",
    runs,
    meanRuleAccuracy: runs.reduce((sum, run) => sum + run.ruleAccuracy, 0) / runs.length,
    meanAdaptiveAccuracy: runs.reduce((sum, run) => sum + run.adaptiveAccuracy, 0) / runs.length,
    meanDelta: runs.reduce((sum, run) => sum + run.delta, 0) / runs.length,
  };

  const outputPath = path.join(
    process.cwd(),
    ".openskynet",
    "skynet-experiments",
    "adaptive_continuity_01.json",
  );
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2), "utf-8");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

await main();
