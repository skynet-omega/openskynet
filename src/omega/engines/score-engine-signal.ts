import type { InnerDriveSignal } from "../inner-life/index.js";
import type { OmegaEngineSignal } from "./types.js";

type OmegaEngineSignalCategory = "curiosity" | "homeostasis" | "entropy_alert";

export type OmegaEngineSignalScore = {
  dominantCategory?: OmegaEngineSignalCategory;
  dominantScore: number;
  categoryScores: Record<OmegaEngineSignalCategory, number>;
  strongestSignal?: OmegaEngineSignal;
  strongestSignals: OmegaEngineSignal[];
  recommendedDrive: InnerDriveSignal;
};

const MIN_CATEGORY_SCORE_TO_ACTIVATE: Record<OmegaEngineSignalCategory, number> = {
  curiosity: 0.75,
  homeostasis: 0.45,
  entropy_alert: 0.55,
};

function classifyOmegaEngineSignal(signal: OmegaEngineSignal): OmegaEngineSignalCategory {
  switch (signal.kind) {
    case "thought":
      return signal.drive === "entropy_minimization" ? "homeostasis" : "curiosity";
    case "contradiction":
      return "homeostasis";
    case "hypothesis_generated":
      return "curiosity";
    case "hypothesis_tested":
      return signal.confirmed === false ? "homeostasis" : "curiosity";
    case "correlation":
      return "entropy_alert";
  }
}

function weightOmegaEngineSignal(signal: OmegaEngineSignal): number {
  switch (signal.kind) {
    case "thought":
      return signal.drive === "adaptive_depth" ? 0.8 : 1.0;
    case "contradiction":
      return 1.35;
    case "hypothesis_generated":
      return 0.7;
    case "hypothesis_tested":
      return signal.confirmed === false ? 1.1 : 0.8;
    case "correlation":
      return 1.25;
  }
}

function scoreOmegaEngineSignal(signal: OmegaEngineSignal): number {
  return Math.max(0, Math.min(1.5, signal.severity * weightOmegaEngineSignal(signal)));
}

function buildEngineDrivenSignal(params: {
  category?: OmegaEngineSignalCategory;
  score: number;
  strongestSignal?: OmegaEngineSignal;
  strongestActivator?: OmegaEngineSignal;
}): InnerDriveSignal {
  const anchorSignal = params.strongestActivator ?? params.strongestSignal;
  if (
    !params.category ||
    !params.strongestActivator ||
    !anchorSignal ||
    params.score < MIN_CATEGORY_SCORE_TO_ACTIVATE[params.category]
  ) {
    return { kind: "idle" };
  }

  const reason = `engine_score:${anchorSignal.source}:${anchorSignal.kind}:${params.score.toFixed(2)}`;
  const urgency = Math.min(0.95, 0.3 + params.score * 0.6);

  switch (params.category) {
    case "curiosity":
      return {
        kind: "curiosity",
        target: "memory/",
        reason,
        urgency,
      };
    case "homeostasis":
      return {
        kind: "homeostasis",
        reason,
        urgency,
      };
    case "entropy_alert":
      return {
        kind: "entropy_alert",
        silentMs: 0,
        reason,
        urgency,
      };
  }
}

export function scoreOmegaEngineSignals(signals: OmegaEngineSignal[]): OmegaEngineSignalScore {
  const categoryScores: Record<OmegaEngineSignalCategory, number> = {
    curiosity: 0,
    homeostasis: 0,
    entropy_alert: 0,
  };
  const sortedSignals = [...signals].sort((left, right) => {
    return scoreOmegaEngineSignal(right) - scoreOmegaEngineSignal(left);
  });

  for (const signal of signals) {
    const category = classifyOmegaEngineSignal(signal);
    categoryScores[category] += scoreOmegaEngineSignal(signal);
  }

  const dominantCategory = (Object.entries(categoryScores).sort(
    (left, right) => right[1] - left[1],
  )[0]?.[0] ?? undefined) as OmegaEngineSignalCategory | undefined;
  const dominantScore = dominantCategory ? categoryScores[dominantCategory] : 0;
  const strongestSignal = sortedSignals[0];
  const strongestActivator = sortedSignals.find(
    (signal) => signal.kind !== "hypothesis_generated" && signal.kind !== "hypothesis_tested",
  );

  return {
    dominantCategory,
    dominantScore,
    categoryScores,
    strongestSignal,
    strongestSignals: sortedSignals.slice(0, 3),
    recommendedDrive: buildEngineDrivenSignal({
      category: dominantCategory,
      score: dominantScore,
      strongestSignal,
      strongestActivator,
    }),
  };
}

export function mergeOmegaDriveSignalWithEngineScore(params: {
  baseDriveSignal: InnerDriveSignal;
  engineScore: OmegaEngineSignalScore;
}): InnerDriveSignal {
  const { baseDriveSignal, engineScore } = params;
  const engineDrive = engineScore.recommendedDrive;

  if (
    engineDrive.kind === "idle" &&
    baseDriveSignal.kind !== "idle" &&
    classifyDriveSignal(baseDriveSignal) === engineScore.dominantCategory &&
    engineScore.dominantScore >= 0.3
  ) {
    return {
      ...baseDriveSignal,
      urgency: Math.min(
        0.99,
        baseDriveSignal.urgency + Math.min(0.15, engineScore.dominantScore * 0.1),
      ),
      reason: `${baseDriveSignal.reason} [ENGINE-SCORE:${engineScore.dominantScore.toFixed(2)}]`,
    };
  }

  if (engineDrive.kind === "idle") {
    return baseDriveSignal;
  }

  if (baseDriveSignal.kind === "idle") {
    return engineDrive;
  }

  if (baseDriveSignal.kind === engineDrive.kind) {
    return {
      ...baseDriveSignal,
      urgency: Math.min(0.99, Math.max(baseDriveSignal.urgency, engineDrive.urgency)),
      reason: `${baseDriveSignal.reason} [ENGINE-SCORE:${engineScore.dominantScore.toFixed(2)}]`,
    };
  }

  return {
    ...baseDriveSignal,
    urgency: Math.min(
      0.99,
      baseDriveSignal.urgency + Math.min(0.15, engineScore.dominantScore * 0.1),
    ),
    reason: `${baseDriveSignal.reason} [ENGINE-SCORE:${engineScore.dominantCategory ?? "none"}=${engineScore.dominantScore.toFixed(2)}]`,
  };
}

function classifyDriveSignal(
  signal: Exclude<InnerDriveSignal, { kind: "idle" }>,
): OmegaEngineSignalCategory {
  switch (signal.kind) {
    case "curiosity":
      return "curiosity";
    case "homeostasis":
      return "homeostasis";
    case "entropy_alert":
    case "competence_drive":
      return "entropy_alert";
  }
}
