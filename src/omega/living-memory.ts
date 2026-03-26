import fs from "node:fs/promises";
import path from "node:path";
import { movePathToTrash } from "../browser/trash.js";
import type { SkynetCommitmentDecision } from "../skynet/commitment-engine.js";
import type { SkynetExperimentPlan } from "../skynet/experiment-cycle.js";
import {
  loadOpenSkynetInternalProjectProfile,
  type OpenSkynetInternalProjectProfile,
} from "./internal-project.js";
import { resolveOmegaStateDir } from "./paths.js";
import type { OmegaWorldModelSnapshot } from "./world-model.js";

export type OpenSkynetLivingState = {
  sessionKey: string;
  updatedAt: number;
  selfModel: {
    platform: {
      name: "OpenSkyNet";
      role: string;
      priority: "primary";
    };
    internalProject: {
      key: string;
      name: string;
      role: string;
      mission: string;
      benchmarkPurpose: string;
      successCriteria: string[];
      priority: "secondary";
    };
    reporting: {
      separatePlatformFromInternalProject: true;
      maintenanceIsNotProjectProgress: true;
      internalProjectActsAsAgenticBenchmark: true;
      avoidAnthropomorphicClaimsWithoutEvidence: true;
      authoritativeStateSources: string[];
    };
  };
  identity: {
    continuityId: string | null;
    turnCount: number;
    activeGoalTask: string | null;
    lastOutcomeStatus: string | null;
    failureStreak: number;
  };
  omega: {
    timelineLength: number;
    learnedConstraints: string[];
    topProblemClasses: string[];
    recoveryPreference: string | null;
    localityPreference: string | null;
  };
  agenticBenchmark: {
    projectKey: string;
    projectName: string;
    continuityScore: number | null;
    hasRunnableExperiment: boolean;
    hasExplicitCommitment: boolean;
    hasRecommendedAction: boolean;
    benchmarkScore: number;
  };
  internalProjectState: {
    name: string;
    focusKey: string | null;
    focusTitle: string | null;
    mode: string | null;
    continuityScore: number | null;
    topWorkItem: string | null;
    recommendedAction: string | null;
    commitment: {
      kind: string;
      artifactKind: string;
      confidence: number;
      executableTask: string;
    } | null;
    experiment: {
      focusKey: string;
      mode: string;
      deliverable: string;
      killCriteria: string;
      benchmarkHook: string;
    } | null;
  };
  /** @deprecated compatibility alias; prefer internalProjectState */
  skynet: {
    name: "Skynet";
    focusKey: string | null;
    focusTitle: string | null;
    mode: string | null;
    continuityScore: number | null;
    topWorkItem: string | null;
    recommendedAction: string | null;
    commitment: {
      kind: string;
      artifactKind: string;
      confidence: number;
      executableTask: string;
    } | null;
    experiment: {
      focusKey: string;
      mode: string;
      deliverable: string;
      killCriteria: string;
      benchmarkHook: string;
    } | null;
  };
};

export type OpenSkynetLivingMemoryEvent = {
  ts: number;
  sessionKey: string;
  kind:
    | "runtime_initialized"
    | "skynet_focus_changed"
    | "skynet_mode_changed"
    | "skynet_commitment_changed"
    | "skynet_continuity_shift"
    | "omega_active_goal_changed";
  payload: Record<string, unknown>;
};

function sanitizeSessionKey(sessionKey: string): string {
  return (sessionKey.trim() || "main").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 64) || "main";
}

function toWorkspaceRelative(workspaceRoot: string, absolutePath: string): string {
  return path.relative(workspaceRoot, absolutePath).split(path.sep).join("/");
}

export function resolveOpenSkynetLivingMemoryDir(workspaceRoot: string): string {
  return path.join(resolveOmegaStateDir(workspaceRoot), "living-memory");
}

export function resolveOpenSkynetLivingStateFile(params: {
  workspaceRoot: string;
  sessionKey: string;
}): string {
  return path.join(
    resolveOpenSkynetLivingMemoryDir(params.workspaceRoot),
    "state",
    `${sanitizeSessionKey(params.sessionKey)}.json`,
  );
}

export function resolveOpenSkynetLivingHistoryFile(workspaceRoot: string): string {
  return path.join(resolveOpenSkynetLivingMemoryDir(workspaceRoot), "history.jsonl");
}

async function pathExists(filePath: string): Promise<boolean> {
  return fs
    .access(filePath)
    .then(() => true)
    .catch(() => false);
}

async function collectRelativeFiles(params: {
  workspaceRoot: string;
  absoluteDir: string;
  suffixes?: string[];
}): Promise<string[]> {
  try {
    const entries = await fs.readdir(params.absoluteDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .filter((entry) =>
        params.suffixes?.length
          ? params.suffixes.some((suffix) => entry.name.endsWith(suffix))
          : true,
      )
      .map((entry) =>
        toWorkspaceRelative(params.workspaceRoot, path.join(params.absoluteDir, entry.name)),
      )
      .sort();
  } catch {
    return [];
  }
}

export async function collectOpenSkynetMemoryCandidates(workspaceRoot: string): Promise<string[]> {
  const structuredDirs = [
    path.join(resolveOmegaStateDir(workspaceRoot), "living-memory", "state"),
    path.join(resolveOmegaStateDir(workspaceRoot), "skynet-nucleus"),
    path.join(resolveOmegaStateDir(workspaceRoot), "skynet-study-program"),
    path.join(resolveOmegaStateDir(workspaceRoot), "skynet-continuity"),
    path.join(resolveOmegaStateDir(workspaceRoot), "skynet-commitment"),
    path.join(resolveOmegaStateDir(workspaceRoot), "skynet-experiments"),
    path.join(resolveOmegaStateDir(workspaceRoot), "skynet-artifacts"),
    path.join(resolveOmegaStateDir(workspaceRoot), "omega-study-supervisor"),
    path.join(resolveOmegaStateDir(workspaceRoot), "omega-executive-state"),
    path.join(resolveOmegaStateDir(workspaceRoot), "omega-problem-agenda"),
  ];

  const candidates: string[] = [];
  for (const dir of structuredDirs) {
    candidates.push(
      ...(await collectRelativeFiles({
        workspaceRoot,
        absoluteDir: dir,
        suffixes: [".json", ".jsonl"],
      })),
    );
  }

  const livingHistory = resolveOpenSkynetLivingHistoryFile(workspaceRoot);
  if (await pathExists(livingHistory)) {
    candidates.push(toWorkspaceRelative(workspaceRoot, livingHistory));
  }

  const preferredHumanFiles = [
    "SCIENCE_BASE.md",
    "MEMORY.md",
    "memory/SKYNET_PULSE.md",
    "memory/SKYNET_CONTINUITY.md",
    "memory/SKYNET_COMMITMENT.md",
    "memory/SKYNET_ACTIVE_EXPERIMENT.md",
    "memory/OMEGA_STUDY_QUEUE.md",
  ];
  for (const rel of preferredHumanFiles) {
    if (await pathExists(path.join(workspaceRoot, rel))) {
      candidates.push(rel);
    }
  }

  return Array.from(new Set(candidates));
}

function deriveRecoveryPreference(snapshot: OmegaWorldModelSnapshot): string | null {
  if (snapshot.activeRecoveryPreference) {
    return `${snapshot.activeRecoveryPreference.preferredRoute}:${snapshot.activeRecoveryPreference.confidence.toFixed(2)}`;
  }
  if (snapshot.generalizedRecoveryPreference) {
    return `${snapshot.generalizedRecoveryPreference.preferredRoute}:${snapshot.generalizedRecoveryPreference.mechanismKey}`;
  }
  return null;
}

function deriveLocalityPreference(snapshot: OmegaWorldModelSnapshot): string | null {
  if (snapshot.localityExecutionGuard?.shouldIsolate) {
    return `guard:isolate:${snapshot.localityExecutionGuard.confidence.toFixed(2)}`;
  }
  if (snapshot.localityRoutingPreference) {
    return `${snapshot.localityRoutingPreference.preferredRoute}:${snapshot.localityRoutingPreference.confidence.toFixed(2)}`;
  }
  return null;
}

function deriveLivingState(params: {
  project: OpenSkynetInternalProjectProfile;
  sessionKey: string;
  snapshot: OmegaWorldModelSnapshot;
  recommendedAction?: string;
  commitment?: SkynetCommitmentDecision;
  experiment?: SkynetExperimentPlan;
}): OpenSkynetLivingState {
  const continuityScore = params.snapshot.skynetContinuity?.continuityScore ?? null;
  const hasRunnableExperiment = Boolean(params.experiment);
  const hasExplicitCommitment = Boolean(params.commitment?.executableTask);
  const hasRecommendedAction = Boolean(params.recommendedAction);
  const benchmarkScore = Math.max(
    0,
    Math.min(
      1,
      (typeof continuityScore === "number" ? continuityScore * 0.45 : 0) +
        (hasRunnableExperiment ? 0.2 : 0) +
        (hasExplicitCommitment ? 0.2 : 0) +
        (hasRecommendedAction ? 0.15 : 0),
    ),
  );

  return {
    sessionKey: params.sessionKey,
    updatedAt: Date.now(),
    selfModel: {
      platform: {
        name: "OpenSkyNet",
        role: "Primary agent platform responsible for memory, tooling, evaluation, gateway, integration, and autonomous execution quality.",
        priority: "primary",
      },
      internalProject: {
        key: params.project.key,
        name: params.project.name,
        role: params.project.role,
        mission: params.project.mission,
        benchmarkPurpose: params.project.benchmarkPurpose,
        successCriteria: params.project.successCriteria,
        priority: "secondary",
      },
      reporting: {
        separatePlatformFromInternalProject: true,
        maintenanceIsNotProjectProgress: true,
        internalProjectActsAsAgenticBenchmark: true,
        avoidAnthropomorphicClaimsWithoutEvidence: true,
        authoritativeStateSources: [
          ".openskynet/living-memory/state/*.json",
          ".openskynet/living-memory/history.jsonl",
          ".openskynet/skynet-*/*.json",
        ],
      },
    },
    identity: {
      continuityId: params.snapshot.kernel?.identity.continuityId ?? null,
      turnCount: params.snapshot.kernel?.turnCount ?? 0,
      activeGoalTask: params.snapshot.activeGoalTask ?? null,
      lastOutcomeStatus: params.snapshot.kernel?.world.lastOutcomeStatus ?? null,
      failureStreak: params.snapshot.kernel?.tension.failureStreak ?? 0,
    },
    omega: {
      timelineLength: params.snapshot.timelineLength,
      learnedConstraints: params.snapshot.selfState?.learnedConstraints ?? [],
      topProblemClasses: params.snapshot.problemAgenda.slice(0, 5).map((item) => item.classKey),
      recoveryPreference: deriveRecoveryPreference(params.snapshot),
      localityPreference: deriveLocalityPreference(params.snapshot),
    },
    agenticBenchmark: {
      projectKey: params.project.key,
      projectName: params.project.name,
      continuityScore,
      hasRunnableExperiment,
      hasExplicitCommitment,
      hasRecommendedAction,
      benchmarkScore,
    },
    internalProjectState: {
      name: params.project.name,
      focusKey: params.snapshot.skynetStudyProgram?.focusKey ?? params.experiment?.focusKey ?? null,
      focusTitle: params.snapshot.studySupervisor?.focus.title ?? null,
      mode: params.snapshot.skynetNucleus?.mode ?? null,
      continuityScore: params.snapshot.skynetContinuity?.continuityScore ?? null,
      topWorkItem: params.snapshot.skynetStudyProgram?.items[0]?.title ?? null,
      recommendedAction: params.recommendedAction ?? null,
      commitment: params.commitment
        ? {
            kind: params.commitment.kind,
            artifactKind: params.commitment.artifactKind,
            confidence: params.commitment.confidence,
            executableTask: params.commitment.executableTask,
          }
        : null,
      experiment: params.experiment
        ? {
            focusKey: params.experiment.focusKey,
            mode: params.experiment.mode,
            deliverable: params.experiment.deliverable,
            killCriteria: params.experiment.killCriteria,
            benchmarkHook: params.experiment.benchmarkHook,
          }
        : null,
    },
    skynet: {
      name: "Skynet",
      focusKey: params.snapshot.skynetStudyProgram?.focusKey ?? params.experiment?.focusKey ?? null,
      focusTitle: params.snapshot.studySupervisor?.focus.title ?? null,
      mode: params.snapshot.skynetNucleus?.mode ?? null,
      continuityScore: params.snapshot.skynetContinuity?.continuityScore ?? null,
      topWorkItem: params.snapshot.skynetStudyProgram?.items[0]?.title ?? null,
      recommendedAction: params.recommendedAction ?? null,
      commitment: params.commitment
        ? {
            kind: params.commitment.kind,
            artifactKind: params.commitment.artifactKind,
            confidence: params.commitment.confidence,
            executableTask: params.commitment.executableTask,
          }
        : null,
      experiment: params.experiment
        ? {
            focusKey: params.experiment.focusKey,
            mode: params.experiment.mode,
            deliverable: params.experiment.deliverable,
            killCriteria: params.experiment.killCriteria,
            benchmarkHook: params.experiment.benchmarkHook,
          }
        : null,
    },
  };
}

export async function loadOpenSkynetLivingState(params: {
  workspaceRoot: string;
  sessionKey: string;
}): Promise<OpenSkynetLivingState | undefined> {
  try {
    const filePath = resolveOpenSkynetLivingStateFile(params);
    return JSON.parse(await fs.readFile(filePath, "utf-8")) as OpenSkynetLivingState;
  } catch {
    return undefined;
  }
}

function deriveEvents(params: {
  sessionKey: string;
  prior?: OpenSkynetLivingState;
  next: OpenSkynetLivingState;
}): OpenSkynetLivingMemoryEvent[] {
  const ts = params.next.updatedAt;
  const events: OpenSkynetLivingMemoryEvent[] = [];
  if (!params.prior) {
    events.push({
      ts,
      sessionKey: params.sessionKey,
      kind: "runtime_initialized",
      payload: {
        focusKey: params.next.internalProjectState.focusKey,
        mode: params.next.internalProjectState.mode,
      },
    });
    return events;
  }

  if (params.prior.internalProjectState.focusKey !== params.next.internalProjectState.focusKey) {
    events.push({
      ts,
      sessionKey: params.sessionKey,
      kind: "skynet_focus_changed",
      payload: {
        previous: params.prior.internalProjectState.focusKey,
        next: params.next.internalProjectState.focusKey,
      },
    });
  }
  if (params.prior.internalProjectState.mode !== params.next.internalProjectState.mode) {
    events.push({
      ts,
      sessionKey: params.sessionKey,
      kind: "skynet_mode_changed",
      payload: {
        previous: params.prior.internalProjectState.mode,
        next: params.next.internalProjectState.mode,
      },
    });
  }
  if (
    params.prior.internalProjectState.commitment?.kind !==
      params.next.internalProjectState.commitment?.kind ||
    params.prior.internalProjectState.commitment?.artifactKind !==
      params.next.internalProjectState.commitment?.artifactKind
  ) {
    events.push({
      ts,
      sessionKey: params.sessionKey,
      kind: "skynet_commitment_changed",
      payload: {
        previous: params.prior.internalProjectState.commitment ?? null,
        next: params.next.internalProjectState.commitment ?? null,
      },
    });
  }
  if (params.prior.identity.activeGoalTask !== params.next.identity.activeGoalTask) {
    events.push({
      ts,
      sessionKey: params.sessionKey,
      kind: "omega_active_goal_changed",
      payload: {
        previous: params.prior.identity.activeGoalTask,
        next: params.next.identity.activeGoalTask,
      },
    });
  }
  const priorContinuity = params.prior.internalProjectState.continuityScore;
  const nextContinuity = params.next.internalProjectState.continuityScore;
  if (
    typeof priorContinuity === "number" &&
    typeof nextContinuity === "number" &&
    Math.abs(priorContinuity - nextContinuity) >= 0.1
  ) {
    events.push({
      ts,
      sessionKey: params.sessionKey,
      kind: "skynet_continuity_shift",
      payload: {
        previous: priorContinuity,
        next: nextContinuity,
      },
    });
  }
  return events;
}

async function appendEvents(workspaceRoot: string, events: OpenSkynetLivingMemoryEvent[]) {
  if (events.length === 0) {
    return;
  }
  const historyPath = resolveOpenSkynetLivingHistoryFile(workspaceRoot);
  await fs.mkdir(path.dirname(historyPath), { recursive: true });
  const lines = events.map((event) => JSON.stringify(event)).join("\n") + "\n";
  await fs.appendFile(historyPath, lines, "utf-8");
}

export async function syncOpenSkynetLivingMemory(params: {
  workspaceRoot: string;
  sessionKey: string;
  snapshot: OmegaWorldModelSnapshot;
  recommendedAction?: string;
  commitment?: SkynetCommitmentDecision;
  experiment?: SkynetExperimentPlan;
}): Promise<OpenSkynetLivingState> {
  const prior = await loadOpenSkynetLivingState(params);
  const project = await loadOpenSkynetInternalProjectProfile(params.workspaceRoot);
  const next = deriveLivingState({ ...params, project });
  const statePath = resolveOpenSkynetLivingStateFile(params);
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, JSON.stringify(next, null, 2) + "\n", "utf-8");
  await appendEvents(
    params.workspaceRoot,
    deriveEvents({ sessionKey: params.sessionKey, prior, next }),
  );
  return next;
}

export async function planOpenSkynetMemoryReset(params: {
  workspaceRoot: string;
  includeHumanReadable?: boolean;
}): Promise<string[]> {
  const targets = [
    path.join(resolveOmegaStateDir(params.workspaceRoot), "living-memory"),
    path.join(resolveOmegaStateDir(params.workspaceRoot), "skynet-nucleus"),
    path.join(resolveOmegaStateDir(params.workspaceRoot), "skynet-study-program"),
    path.join(resolveOmegaStateDir(params.workspaceRoot), "skynet-continuity"),
    path.join(resolveOmegaStateDir(params.workspaceRoot), "skynet-commitment"),
    path.join(resolveOmegaStateDir(params.workspaceRoot), "skynet-experiments"),
    path.join(resolveOmegaStateDir(params.workspaceRoot), "skynet-artifacts"),
    path.join(resolveOmegaStateDir(params.workspaceRoot), "omega-study-supervisor"),
    path.join(resolveOmegaStateDir(params.workspaceRoot), "omega-executive-state"),
    path.join(resolveOmegaStateDir(params.workspaceRoot), "omega-problem-agenda"),
    path.join(resolveOmegaStateDir(params.workspaceRoot), "holographic-memory.json"),
    path.join(resolveOmegaStateDir(params.workspaceRoot), "omega-empirical-metrics.json"),
    path.join(resolveOmegaStateDir(params.workspaceRoot), "heartbeat.log"),
  ];
  if (params.includeHumanReadable) {
    targets.push(
      path.join(params.workspaceRoot, "memory", "SKYNET_PULSE.md"),
      path.join(params.workspaceRoot, "memory", "SKYNET_CONTINUITY.md"),
      path.join(params.workspaceRoot, "memory", "SKYNET_COMMITMENT.md"),
      path.join(params.workspaceRoot, "memory", "SKYNET_ACTIVE_EXPERIMENT.md"),
      path.join(params.workspaceRoot, "memory", "SKYNET_EXPERIMENT_AUTONOMY_PULSE_01.md"),
      path.join(params.workspaceRoot, "memory", "SKYNET_DECISION_BIFURCATION_PROBE.md"),
      path.join(params.workspaceRoot, "memory", "SKYNET_FOCAL_POINT.md"),
      path.join(params.workspaceRoot, "memory", "SKYNET_BENCHMARK_HARDENING.md"),
      path.join(params.workspaceRoot, "memory", "SKYNET_RESEARCH_HARVEST.md"),
      path.join(params.workspaceRoot, "memory", "SKYNET_CONTEXT_BASE.md"),
      path.join(params.workspaceRoot, "memory", "OMEGA_STUDY_QUEUE.md"),
    );
  }
  const existing = await Promise.all(
    targets.map(async (target) => ((await pathExists(target)) ? target : undefined)),
  );
  return existing.filter((value): value is string => Boolean(value)).sort();
}

export async function resetOpenSkynetMemory(params: {
  workspaceRoot: string;
  includeHumanReadable?: boolean;
}): Promise<Array<{ from: string; to: string }>> {
  const targets = await planOpenSkynetMemoryReset(params);
  const moved: Array<{ from: string; to: string }> = [];
  for (const target of targets) {
    moved.push({
      from: target,
      to: await movePathToTrash(target),
    });
  }
  return moved;
}
