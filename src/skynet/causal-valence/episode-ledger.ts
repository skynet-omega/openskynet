import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { writeJsonAtomic } from "../../infra/json-files.js";
import type { SkynetWorldTransitionObservation } from "./world-transition.js";

export type SkynetCausalContinuityFreshness = "fresh" | "aging" | "stale" | "missing";
export type SkynetCausalValenceLabel = "progress" | "relief" | "stall" | "frustration" | "damage";

export type SkynetCausalEpisodeContext = {
  taskText?: string;
  continuityFreshness: SkynetCausalContinuityFreshness;
  failureStreak: number;
  targetCount: number;
  validationIntensity: number;
};

export type SkynetCausalEpisodeOutcome = {
  status: "ok" | "error" | "timeout";
  targetSatisfied: boolean;
  validationPassed: boolean;
  continuityDelta: number;
  recoveryBurden: number;
  collateralDamage: number;
};

export type SkynetCausalEpisode = {
  id: string;
  sessionKey: string;
  recordedAt: number;
  context: SkynetCausalEpisodeContext;
  transition: SkynetWorldTransitionObservation;
  outcome: SkynetCausalEpisodeOutcome;
  bootstrapLabel: SkynetCausalValenceLabel;
};

export type SkynetCausalLedgerState = {
  updatedAt: number;
  episodeCount: number;
  labelCounts: Record<SkynetCausalValenceLabel, number>;
};

const LABELS: SkynetCausalValenceLabel[] = ["progress", "relief", "stall", "frustration", "damage"];

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function sanitizeSessionKey(sessionKey: string): string {
  return (sessionKey.trim() || "main").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 64) || "main";
}

function stableId(payload: string): string {
  return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

function normalizeContext(context: SkynetCausalEpisodeContext): SkynetCausalEpisodeContext {
  return {
    taskText: typeof context.taskText === "string" ? context.taskText : undefined,
    continuityFreshness: context.continuityFreshness,
    failureStreak: Math.max(0, Math.round(context.failureStreak)),
    targetCount: Math.max(0, Math.round(context.targetCount)),
    validationIntensity: clamp01(context.validationIntensity),
  };
}

function normalizeOutcome(outcome: SkynetCausalEpisodeOutcome): SkynetCausalEpisodeOutcome {
  return {
    status: outcome.status,
    targetSatisfied: Boolean(outcome.targetSatisfied),
    validationPassed: Boolean(outcome.validationPassed),
    continuityDelta: clamp01(outcome.continuityDelta),
    recoveryBurden: clamp01(outcome.recoveryBurden),
    collateralDamage: clamp01(outcome.collateralDamage),
  };
}

export function resolveSkynetCausalValenceDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".openskynet", "skynet-causal-valence");
}

export function resolveSkynetCausalEpisodeLedgerPath(workspaceRoot: string): string {
  return path.join(resolveSkynetCausalValenceDir(workspaceRoot), "episodes.jsonl");
}

export function resolveSkynetCausalLedgerStatePath(workspaceRoot: string): string {
  return path.join(resolveSkynetCausalValenceDir(workspaceRoot), "state.json");
}

export function deriveSkynetBootstrapValenceLabel(params: {
  context: SkynetCausalEpisodeContext;
  outcome: SkynetCausalEpisodeOutcome;
}): SkynetCausalValenceLabel {
  const context = normalizeContext(params.context);
  const outcome = normalizeOutcome(params.outcome);

  if (
    outcome.status !== "ok" &&
    (outcome.collateralDamage >= 0.35 || outcome.recoveryBurden >= 0.6 || !outcome.validationPassed)
  ) {
    return "damage";
  }
  if (outcome.status !== "ok" && context.failureStreak >= 2 && outcome.recoveryBurden >= 0.35) {
    return "frustration";
  }
  if (
    outcome.status === "ok" &&
    outcome.targetSatisfied &&
    outcome.validationPassed &&
    context.failureStreak >= 1 &&
    outcome.continuityDelta >= 0.45
  ) {
    return "relief";
  }
  if (
    outcome.status === "ok" &&
    outcome.targetSatisfied &&
    outcome.validationPassed &&
    outcome.continuityDelta >= 0.35 &&
    outcome.collateralDamage <= 0.2
  ) {
    return "progress";
  }
  if (outcome.status === "ok" && (!outcome.targetSatisfied || outcome.continuityDelta <= 0.15)) {
    return "stall";
  }
  if (outcome.collateralDamage >= 0.3 || outcome.recoveryBurden >= 0.55) {
    return "damage";
  }
  if (context.failureStreak >= 2) {
    return "frustration";
  }
  return outcome.continuityDelta >= 0.25 ? "progress" : "stall";
}

export async function appendSkynetCausalEpisode(params: {
  workspaceRoot: string;
  sessionKey: string;
  context: SkynetCausalEpisodeContext;
  transition: SkynetWorldTransitionObservation;
  outcome: SkynetCausalEpisodeOutcome;
  recordedAt?: number;
}): Promise<SkynetCausalEpisode> {
  const recordedAt = params.recordedAt ?? Date.now();
  const context = normalizeContext(params.context);
  const outcome = normalizeOutcome(params.outcome);
  const bootstrapLabel = deriveSkynetBootstrapValenceLabel({ context, outcome });
  const episode: SkynetCausalEpisode = {
    id: stableId(
      JSON.stringify({
        sessionKey: params.sessionKey,
        recordedAt,
        context,
        transition: params.transition,
        outcome,
      }),
    ),
    sessionKey: params.sessionKey,
    recordedAt,
    context,
    transition: params.transition,
    outcome,
    bootstrapLabel,
  };
  const ledgerPath = resolveSkynetCausalEpisodeLedgerPath(params.workspaceRoot);
  const statePath = resolveSkynetCausalLedgerStatePath(params.workspaceRoot);
  await fs.mkdir(path.dirname(ledgerPath), { recursive: true });
  await fs.appendFile(ledgerPath, `${JSON.stringify(episode)}\n`, "utf-8");
  const existingState = (await loadSkynetCausalLedgerState(params.workspaceRoot)) ?? {
    updatedAt: recordedAt,
    episodeCount: 0,
    labelCounts: {
      progress: 0,
      relief: 0,
      stall: 0,
      frustration: 0,
      damage: 0,
    },
  };
  existingState.updatedAt = recordedAt;
  existingState.episodeCount += 1;
  existingState.labelCounts[bootstrapLabel] += 1;
  await writeJsonAtomic(statePath, existingState, { trailingNewline: true });
  return episode;
}

export async function loadSkynetCausalEpisodes(
  workspaceRoot: string,
): Promise<SkynetCausalEpisode[]> {
  try {
    const raw = await fs.readFile(resolveSkynetCausalEpisodeLedgerPath(workspaceRoot), "utf-8");
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as SkynetCausalEpisode);
  } catch {
    return [];
  }
}

export async function loadSkynetCausalLedgerState(
  workspaceRoot: string,
): Promise<SkynetCausalLedgerState | null> {
  try {
    const raw = await fs.readFile(resolveSkynetCausalLedgerStatePath(workspaceRoot), "utf-8");
    const parsed = JSON.parse(raw) as Partial<SkynetCausalLedgerState>;
    return {
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
      episodeCount: typeof parsed.episodeCount === "number" ? parsed.episodeCount : 0,
      labelCounts: LABELS.reduce(
        (acc, label) => {
          acc[label] =
            typeof parsed.labelCounts?.[label] === "number" ? parsed.labelCounts[label] : 0;
          return acc;
        },
        {} as Record<SkynetCausalValenceLabel, number>,
      ),
    };
  } catch {
    return null;
  }
}

export function deriveSkynetCausalLabelCounts(
  episodes: SkynetCausalEpisode[],
): Record<SkynetCausalValenceLabel, number> {
  return LABELS.reduce(
    (acc, label) => {
      acc[label] = episodes.filter((episode) => episode.bootstrapLabel === label).length;
      return acc;
    },
    {} as Record<SkynetCausalValenceLabel, number>,
  );
}
