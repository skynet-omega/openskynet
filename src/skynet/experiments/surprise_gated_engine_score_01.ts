import fs from "node:fs/promises";
import path from "node:path";
import { scoreOmegaEngineSignals } from "../../omega/engines/score-engine-signal.js";
import type { OmegaEngineSignal } from "../../omega/engines/types.js";
import type { InnerDriveSignal } from "../../omega/inner-life/index.js";

type ExpectedCase = {
  signals: OmegaEngineSignal[];
  expectedKind: InnerDriveSignal["kind"];
};

type RunResult = {
  seed: number;
  legacyMatchRate: number;
  candidateMatchRate: number;
  delta: number;
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function makeSignal(
  rand: () => number,
  category: "curiosity" | "homeostasis" | "entropy_alert",
): OmegaEngineSignal {
  switch (category) {
    case "curiosity":
      return {
        source: "continuous-thinking",
        kind: "thought",
        severity: clamp(0.35 + rand() * 0.55, 0, 1.2),
        summary: "epistemic gap",
        thoughtId: `thought_${Math.floor(rand() * 1000)}`,
        drive: rand() < 0.5 ? "learning" : "adaptive_depth",
      };
    case "homeostasis":
      return {
        source: "entropy-minimization",
        kind: "contradiction",
        severity: clamp(0.25 + rand() * 0.6, 0, 1.2),
        summary: "state contradiction",
        contradictionKind: "goal_conflict",
      };
    case "entropy_alert":
      return {
        source: "jepa-empirical",
        kind: "correlation",
        severity: clamp(0.25 + rand() * 0.6, 0, 1.2),
        summary: "jepa correlation spike",
        correlationScore: 0.5,
        totalEvents: 12,
      };
  }
}

function expectedKindForCase(params: {
  targetCategory: "curiosity" | "homeostasis" | "entropy_alert";
  targetStrength: number;
  noiseLevel: number;
  bookkeepingOnly: boolean;
}): InnerDriveSignal["kind"] {
  if (params.bookkeepingOnly) {
    return "idle";
  }
  if (
    params.targetCategory === "curiosity" &&
    params.targetStrength >= 0.72 &&
    params.noiseLevel <= 0.2
  ) {
    return "curiosity";
  }
  if (params.targetCategory === "homeostasis" && params.targetStrength >= 0.4) {
    return "homeostasis";
  }
  if (params.targetCategory === "entropy_alert" && params.targetStrength >= 0.5) {
    return "entropy_alert";
  }
  if (params.targetStrength >= 0.62 && params.noiseLevel <= 0.08) {
    return params.targetCategory === "homeostasis"
      ? "homeostasis"
      : params.targetCategory === "entropy_alert"
        ? "entropy_alert"
        : "curiosity";
  }
  return "idle";
}

function generateCase(seed: number): ExpectedCase {
  const rand = mulberry32(seed);
  const categories = ["curiosity", "homeostasis", "entropy_alert"] as const;
  const targetCategory = categories[Math.floor(rand() * categories.length)];
  const bookkeepingOnly = rand() < 0.12;
  const targetStrength = clamp(0.28 + rand() * 0.6, 0, 1.2);
  const noiseLevel = rand() * 0.3;

  const signals: OmegaEngineSignal[] = [];
  if (bookkeepingOnly) {
    signals.push({
      source: "active-learning",
      kind: rand() < 0.5 ? "hypothesis_generated" : "hypothesis_tested",
      severity: 1,
      summary: "bookkeeping",
      hypothesisId: `hyp_${Math.floor(rand() * 1000)}`,
      confirmed: rand() < 0.5,
    });
  } else {
    const dominant = makeSignal(rand, targetCategory);
    dominant.severity = targetStrength;
    signals.push(dominant);
  }

  const noiseCount = Math.floor(rand() * 3);
  for (let i = 0; i < noiseCount; i += 1) {
    const noiseCategory = categories[Math.floor(rand() * categories.length)];
    const signal = makeSignal(rand, noiseCategory);
    signal.severity = clamp(signal.severity * noiseLevel, 0.05, 0.55);
    signals.push(signal);
  }

  return {
    signals,
    expectedKind: expectedKindForCase({
      targetCategory,
      targetStrength,
      noiseLevel,
      bookkeepingOnly,
    }),
  };
}

function dynamicThreshold(
  kind: "curiosity" | "homeostasis" | "entropy_alert",
  dominanceMargin: number,
  strongestScore: number,
): number {
  const base = {
    curiosity: 0.75,
    homeostasis: 0.45,
    entropy_alert: 0.55,
  }[kind];
  const dominanceAdjustment = dominanceMargin > 0.18 ? Math.min(0.08, strongestScore * 0.08) : 0;
  return base - dominanceAdjustment;
}

function candidateKind(signals: OmegaEngineSignal[]): InnerDriveSignal["kind"] {
  const score = scoreOmegaEngineSignals(signals);
  const dominant = score.dominantCategory;
  if (!dominant || !score.strongestSignal) {
    return "idle";
  }
  const secondScore =
    Object.entries(score.categoryScores)
      .filter(([category]) => category !== dominant)
      .map(([, value]) => value)
      .sort((a, b) => b - a)[0] ?? 0;
  const dominanceMargin = score.dominantScore - secondScore;
  const threshold = dynamicThreshold(dominant, dominanceMargin, score.dominantScore);
  if (score.dominantScore < threshold) {
    return "idle";
  }
  return score.recommendedDrive.kind;
}

function evaluateRun(seed: number): RunResult {
  const seeds = Array.from({ length: 256 }, (_, index) => seed * 1000 + index);
  let legacyMatches = 0;
  let candidateMatches = 0;

  for (const caseSeed of seeds) {
    const testCase = generateCase(caseSeed);
    const legacy = scoreOmegaEngineSignals(testCase.signals).recommendedDrive.kind;
    const candidate = candidateKind(testCase.signals);
    legacyMatches += Number(legacy === testCase.expectedKind);
    candidateMatches += Number(candidate === testCase.expectedKind);
  }

  return {
    seed,
    legacyMatchRate: legacyMatches / seeds.length,
    candidateMatchRate: candidateMatches / seeds.length,
    delta: candidateMatches / seeds.length - legacyMatches / seeds.length,
  };
}

async function main() {
  const seeds = [101, 202, 303, 404, 505];
  const runs = seeds.map((seed) => evaluateRun(seed));
  const report = {
    experiment: "surprise_gated_engine_score_01",
    runs,
    meanLegacyMatchRate: runs.reduce((sum, run) => sum + run.legacyMatchRate, 0) / runs.length,
    meanCandidateMatchRate:
      runs.reduce((sum, run) => sum + run.candidateMatchRate, 0) / runs.length,
    meanDelta: runs.reduce((sum, run) => sum + run.delta, 0) / runs.length,
  };

  const outputPath = path.join(
    process.cwd(),
    ".openskynet",
    "skynet-experiments",
    "surprise_gated_engine_score_01.json",
  );
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2), "utf-8");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

await main();
