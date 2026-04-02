import fs from "node:fs/promises";
import path from "node:path";

type OutcomeStatus = "ok" | "error";

type TimelineEntry = {
  outcome?: { status: OutcomeStatus };
  turn?: number;
};

type DriveSignal =
  | { kind: "idle" }
  | { kind: "homeostasis"; urgency: number; reason: string }
  | { kind: "curiosity"; urgency: number; reason: string; target: string }
  | { kind: "entropy_alert"; urgency: number; reason: string; silentMs: number };

type Tension = {
  frustration: number;
  confidence: number;
  surprise: number;
};

type RunResult = {
  seed: number;
  legacyMatchRate: number;
  candidateMatchRate: number;
  legacyUrgencyError: number;
  candidateUrgencyError: number;
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

function buildTimeline(failureRate: number, window: number, rand: () => number): TimelineEntry[] {
  return Array.from({ length: window }, (_, index) => ({
    turn: index + 1,
    outcome: {
      status: rand() < failureRate ? "error" : "ok",
    },
  }));
}

function parseLegacy(timeline: TimelineEntry[]): Tension {
  const recent = timeline.slice(-Math.min(5, timeline.length));
  const failures = recent.filter((entry) => entry.outcome?.status === "error").length;
  const failureRate = failures / Math.max(1, recent.length);
  return {
    frustration: Math.min(2, failureRate * 2),
    confidence: 1 - failureRate,
    surprise: 0,
  };
}

function parseCandidate(timeline: TimelineEntry[]): Tension {
  if (!timeline.length) {
    return { frustration: 0, confidence: 0, surprise: 0 };
  }
  const recentWindow = timeline.slice(-Math.min(5, timeline.length));
  const priorWindow = timeline.slice(
    Math.max(0, timeline.length - Math.min(10, timeline.length)),
    Math.max(0, timeline.length - Math.min(5, timeline.length)),
  );
  const recentFailureRate =
    recentWindow.filter((entry) => entry.outcome?.status === "error").length /
    Math.max(1, recentWindow.length);
  const priorFailureRate =
    priorWindow.length === 0
      ? recentFailureRate
      : priorWindow.filter((entry) => entry.outcome?.status === "error").length /
        Math.max(1, priorWindow.length);
  return {
    frustration: Math.min(2, recentFailureRate * 2),
    confidence: 1 - recentFailureRate,
    surprise: clamp(Math.max(0, recentFailureRate - priorFailureRate), 0, 1),
  };
}

function enhanceLegacy(drive: DriveSignal, tension: Tension): DriveSignal {
  if (tension.confidence < 0.3) {
    return drive;
  }
  if (drive.kind === "idle" && tension.frustration > 1.5) {
    return {
      kind: "entropy_alert",
      silentMs: 0,
      reason: "legacy_entropy_alert",
      urgency: Math.min(0.95, 0.6 + tension.frustration * 0.15),
    };
  }
  if (drive.kind !== "idle" && tension.frustration > 0.5) {
    const urgency = "urgency" in drive ? drive.urgency : 0.5;
    return {
      ...(drive.kind === "homeostasis"
        ? { kind: "homeostasis" as const }
        : { kind: "curiosity" as const, target: "memory/" }),
      reason: "legacy_boost",
      urgency: Math.min(0.99, urgency + tension.frustration * 0.15),
    };
  }
  if (drive.kind === "idle" && tension.frustration > 0.5 && tension.frustration <= 1.5) {
    if (tension.frustration > 1.0) {
      return {
        kind: "curiosity",
        target: "memory/",
        reason: "legacy_curiosity",
        urgency: Math.min(0.8, 0.4 + tension.frustration * 0.15),
      };
    }
    return {
      kind: "homeostasis",
      reason: "legacy_homeostasis",
      urgency: Math.min(0.8, 0.4 + tension.frustration * 0.15),
    };
  }
  return drive;
}

function enhanceCandidate(drive: DriveSignal, tension: Tension): DriveSignal {
  if (tension.confidence < 0.3) {
    return drive;
  }
  const worsening = tension.surprise;

  if (
    drive.kind === "idle" &&
    (tension.frustration > 1.5 || (tension.frustration > 1.0 && worsening > 0.28))
  ) {
    return {
      kind: "entropy_alert",
      silentMs: 0,
      reason: "surprise_entropy_alert",
      urgency: Math.min(0.98, 0.58 + tension.frustration * 0.12 + worsening * 0.2),
    };
  }

  if (drive.kind !== "idle" && (tension.frustration > 0.5 || worsening > 0.22)) {
    const urgency = "urgency" in drive ? drive.urgency : 0.5;
    const boost = Math.max(tension.frustration * 0.12, worsening * 0.22);
    return {
      ...(drive.kind === "homeostasis"
        ? { kind: "homeostasis" as const }
        : { kind: "curiosity" as const, target: "memory/" }),
      reason: "surprise_boost",
      urgency: Math.min(0.99, urgency + boost),
    };
  }

  if (drive.kind === "idle" && (tension.frustration > 0.5 || worsening > 0.24)) {
    if (tension.frustration > 0.95 || worsening > 0.35) {
      return {
        kind: "curiosity",
        target: "memory/",
        reason: "surprise_curiosity",
        urgency: Math.min(0.84, 0.38 + tension.frustration * 0.1 + worsening * 0.24),
      };
    }
    return {
      kind: "homeostasis",
      reason: "surprise_homeostasis",
      urgency: Math.min(0.82, 0.36 + tension.frustration * 0.12 + worsening * 0.2),
    };
  }

  return drive;
}

function expectedDrive(params: {
  base: DriveSignal;
  latentCurrentFailureRate: number;
  latentPriorFailureRate: number;
}): { kind: DriveSignal["kind"]; urgency: number } {
  const frustration = Math.min(2, params.latentCurrentFailureRate * 2);
  const worsening = Math.max(0, params.latentCurrentFailureRate - params.latentPriorFailureRate);

  if (
    params.base.kind === "idle" &&
    (frustration > 1.5 || (frustration > 1.0 && worsening > 0.28))
  ) {
    return {
      kind: "entropy_alert",
      urgency: Math.min(0.98, 0.58 + frustration * 0.12 + worsening * 0.2),
    };
  }
  if (params.base.kind !== "idle" && (frustration > 0.5 || worsening > 0.22)) {
    const urgency = "urgency" in params.base ? params.base.urgency : 0.5;
    return {
      kind: params.base.kind,
      urgency: Math.min(0.99, urgency + Math.max(frustration * 0.12, worsening * 0.22)),
    };
  }
  if (params.base.kind === "idle" && (frustration > 0.5 || worsening > 0.24)) {
    return {
      kind: frustration > 0.95 || worsening > 0.35 ? "curiosity" : "homeostasis",
      urgency: Math.min(0.84, 0.38 + frustration * 0.1 + worsening * 0.24),
    };
  }
  return {
    kind: params.base.kind,
    urgency: "urgency" in params.base ? params.base.urgency : 0,
  };
}

function generateCase(seed: number) {
  const rand = mulberry32(seed);
  const priorRate = clamp(0.05 + rand() * 0.55, 0, 1);
  const delta = rand() < 0.5 ? rand() * 0.45 : -rand() * 0.25;
  const currentRate = clamp(priorRate + delta, 0, 1);
  const base: DriveSignal =
    rand() < 0.45
      ? { kind: "idle" }
      : rand() < 0.5
        ? { kind: "homeostasis", urgency: 0.45 + rand() * 0.2, reason: "base_homeostasis" }
        : {
            kind: "curiosity",
            urgency: 0.45 + rand() * 0.2,
            reason: "base_curiosity",
            target: "memory/",
          };

  const timeline = [...buildTimeline(priorRate, 5, rand), ...buildTimeline(currentRate, 5, rand)];
  return { timeline, base, priorRate, currentRate };
}

function evaluateRun(seed: number): RunResult {
  let legacyMatches = 0;
  let candidateMatches = 0;
  let legacyUrgencyError = 0;
  let candidateUrgencyError = 0;
  const caseSeeds = Array.from({ length: 256 }, (_, index) => seed * 1000 + index);

  for (const caseSeed of caseSeeds) {
    const item = generateCase(caseSeed);
    const expected = expectedDrive({
      base: item.base,
      latentCurrentFailureRate: item.currentRate,
      latentPriorFailureRate: item.priorRate,
    });
    const legacy = enhanceLegacy(item.base, parseLegacy(item.timeline));
    const candidate = enhanceCandidate(item.base, parseCandidate(item.timeline));
    legacyMatches += Number(legacy.kind === expected.kind);
    candidateMatches += Number(candidate.kind === expected.kind);
    legacyUrgencyError += Math.abs(("urgency" in legacy ? legacy.urgency : 0) - expected.urgency);
    candidateUrgencyError += Math.abs(
      ("urgency" in candidate ? candidate.urgency : 0) - expected.urgency,
    );
  }

  return {
    seed,
    legacyMatchRate: legacyMatches / caseSeeds.length,
    candidateMatchRate: candidateMatches / caseSeeds.length,
    legacyUrgencyError: legacyUrgencyError / caseSeeds.length,
    candidateUrgencyError: candidateUrgencyError / caseSeeds.length,
    delta: candidateMatches / caseSeeds.length - legacyMatches / caseSeeds.length,
  };
}

async function main() {
  const seeds = [101, 202, 303, 404, 505];
  const runs = seeds.map((seed) => evaluateRun(seed));
  const report = {
    experiment: "surprise_gated_jepa_drive_01",
    runs,
    meanLegacyMatchRate: runs.reduce((sum, run) => sum + run.legacyMatchRate, 0) / runs.length,
    meanCandidateMatchRate:
      runs.reduce((sum, run) => sum + run.candidateMatchRate, 0) / runs.length,
    meanLegacyUrgencyError:
      runs.reduce((sum, run) => sum + run.legacyUrgencyError, 0) / runs.length,
    meanCandidateUrgencyError:
      runs.reduce((sum, run) => sum + run.candidateUrgencyError, 0) / runs.length,
    meanDelta: runs.reduce((sum, run) => sum + run.delta, 0) / runs.length,
  };

  const outputPath = path.join(
    process.cwd(),
    ".openskynet",
    "skynet-experiments",
    "surprise_gated_jepa_drive_01.json",
  );
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2), "utf-8");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

await main();
