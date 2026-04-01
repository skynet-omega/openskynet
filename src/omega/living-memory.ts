import fs from "node:fs/promises";
import path from "node:path";
import { movePathToTrash } from "../browser/trash.js";
import { writeJsonAtomic } from "../infra/json-files.js";
import type { SkynetCommitmentDecision, SkynetExperimentPlan } from "./internal-project-lab.js";
import {
  loadOpenSkynetInternalProjectProfile,
  type OpenSkynetInternalProjectProfile,
} from "./internal-project.js";
import {
  appendOpenSkynetLivingMemoryEvents,
  deriveOpenSkynetLivingMemoryEvents,
} from "./living-memory-events.js";
import {
  loadOmegaOperationalMemorySummary,
  type OmegaOperationalMemorySummary,
} from "./operational-memory.js";
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
      internalProjectFindingsMustTransferToKernel: true;
      internalProjectMustNotBeKernelDependency: true;
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
  authority: {
    worldModelStatus: "healthy" | "degraded";
    kernelStatus: "available" | "missing";
    degradedComponents: string[];
    operationalMemoryStatus: "fresh" | "aging" | "stale" | "missing";
    operationalMemoryLatestAt: number | null;
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

type OpenSkynetLivingProjectState = OpenSkynetLivingState["internalProjectState"];

const STRUCTURED_MEMORY_SUBDIRS = [
  "living-memory/state",
  "skynet-nucleus",
  "skynet-study-program",
  "skynet-continuity",
  "skynet-commitment",
  "skynet-experiments",
  "skynet-artifacts",
  "internal-project-benchmark",
  "omega-study-supervisor",
  "omega-executive-state",
  "omega-problem-agenda",
] as const;

const PREFERRED_HUMAN_MEMORY_FILES = [
  "SCIENCE_BASE.md",
  "MEMORY.md",
  "memory/SKYNET_PULSE.md",
  "memory/SKYNET_CONTINUITY.md",
  "memory/SKYNET_COMMITMENT.md",
  "memory/SKYNET_ACTIVE_EXPERIMENT.md",
  "memory/OMEGA_STUDY_QUEUE.md",
] as const;

const HUMAN_READABLE_RESET_FILES = [
  "memory/SKYNET_PULSE.md",
  "memory/SKYNET_CONTINUITY.md",
  "memory/SKYNET_COMMITMENT.md",
  "memory/SKYNET_ACTIVE_EXPERIMENT.md",
  "memory/SKYNET_EXPERIMENT_AUTONOMY_PULSE_01.md",
  "memory/SKYNET_DECISION_BIFURCATION_PROBE.md",
  "memory/SKYNET_FOCAL_POINT.md",
  "memory/SKYNET_BENCHMARK_HARDENING.md",
  "memory/SKYNET_RESEARCH_HARVEST.md",
  "memory/SKYNET_CONTEXT_BASE.md",
  "memory/OMEGA_STUDY_QUEUE.md",
] as const;

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
  const omegaStateDir = resolveOmegaStateDir(workspaceRoot);
  const structuredDirs = STRUCTURED_MEMORY_SUBDIRS.map((subdir) =>
    path.join(omegaStateDir, ...subdir.split("/")),
  );

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

  for (const rel of PREFERRED_HUMAN_MEMORY_FILES) {
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

function deriveBenchmarkScore(params: {
  continuityScore: number | null;
  hasRunnableExperiment: boolean;
  hasExplicitCommitment: boolean;
  hasRecommendedAction: boolean;
  degradedComponentCount: number;
}): number {
  const authorityPenalty = params.degradedComponentCount > 0 ? 0.75 : 1;
  return Math.max(
    0,
    Math.min(
      1,
      ((typeof params.continuityScore === "number" ? params.continuityScore * 0.45 : 0) +
        (params.hasRunnableExperiment ? 0.2 : 0) +
        (params.hasExplicitCommitment ? 0.2 : 0) +
        (params.hasRecommendedAction ? 0.15 : 0)) *
        authorityPenalty,
    ),
  );
}

function buildLivingProjectState(params: {
  project: OpenSkynetInternalProjectProfile;
  snapshot: OmegaWorldModelSnapshot;
  recommendedAction?: string;
  commitment?: SkynetCommitmentDecision;
  experiment?: SkynetExperimentPlan;
}): OpenSkynetLivingProjectState {
  return {
    name: params.project.name,
    focusKey:
      params.snapshot.internalProjectStudyProgram?.focusKey ?? params.experiment?.focusKey ?? null,
    focusTitle: params.snapshot.studySupervisor?.focus.title ?? null,
    mode: params.snapshot.internalProjectNucleus?.mode ?? null,
    continuityScore: params.snapshot.internalProjectContinuity?.continuityScore ?? null,
    topWorkItem: params.snapshot.internalProjectStudyProgram?.items[0]?.title ?? null,
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
  };
}

function buildLivingSelfModel(
  project: OpenSkynetInternalProjectProfile,
): OpenSkynetLivingState["selfModel"] {
  return {
    platform: {
      name: "OpenSkyNet",
      role: "Primary agent platform responsible for memory, tooling, evaluation, gateway, integration, and autonomous execution quality.",
      priority: "primary",
    },
    internalProject: {
      key: project.key,
      name: project.name,
      role: project.role,
      mission: project.mission,
      benchmarkPurpose: project.benchmarkPurpose,
      successCriteria: project.successCriteria,
      priority: "secondary",
    },
    reporting: {
      separatePlatformFromInternalProject: true,
      maintenanceIsNotProjectProgress: true,
      internalProjectActsAsAgenticBenchmark: true,
      internalProjectFindingsMustTransferToKernel: true,
      internalProjectMustNotBeKernelDependency: true,
      avoidAnthropomorphicClaimsWithoutEvidence: true,
      authoritativeStateSources: [
        ".openskynet/living-memory/state/*.json",
        ".openskynet/living-memory/history.jsonl",
        ".openskynet/skynet-*/*.json",
      ],
    },
  };
}

function deriveLivingState(params: {
  project: OpenSkynetInternalProjectProfile;
  sessionKey: string;
  snapshot: OmegaWorldModelSnapshot;
  operationalSummary?: OmegaOperationalMemorySummary;
  recommendedAction?: string;
  commitment?: SkynetCommitmentDecision;
  experiment?: SkynetExperimentPlan;
}): OpenSkynetLivingState {
  const continuityScore = params.snapshot.internalProjectContinuity?.continuityScore ?? null;
  const hasRunnableExperiment = Boolean(params.experiment);
  const hasExplicitCommitment = Boolean(params.commitment?.executableTask);
  const hasRecommendedAction = Boolean(params.recommendedAction);
  const degradedComponents = params.snapshot.degradedComponents.map((entry) => entry.component);
  const operationalMemoryStatus = params.operationalSummary?.freshness ?? "missing";
  const operationalMemoryLatestAt = params.operationalSummary?.latestRecordedAt ?? null;
  const benchmarkScore = deriveBenchmarkScore({
    continuityScore,
    hasRunnableExperiment,
    hasExplicitCommitment,
    hasRecommendedAction,
    degradedComponentCount: degradedComponents.length,
  });
  const internalProjectState = buildLivingProjectState({
    project: params.project,
    snapshot: params.snapshot,
    recommendedAction: params.recommendedAction,
    commitment: params.commitment,
    experiment: params.experiment,
  });

  return {
    sessionKey: params.sessionKey,
    updatedAt: Date.now(),
    selfModel: buildLivingSelfModel(params.project),
    identity: {
      continuityId: params.snapshot.kernel?.identity.continuityId ?? null,
      turnCount: params.snapshot.kernel?.turnCount ?? 0,
      activeGoalTask: params.snapshot.activeGoalTask ?? null,
      lastOutcomeStatus: params.snapshot.kernel?.world.lastOutcomeStatus ?? null,
      failureStreak: params.snapshot.kernel?.tension.failureStreak ?? 0,
    },
    authority: {
      worldModelStatus: degradedComponents.length > 0 ? "degraded" : "healthy",
      kernelStatus: params.snapshot.kernel ? "available" : "missing",
      degradedComponents,
      operationalMemoryStatus,
      operationalMemoryLatestAt,
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
    internalProjectState,
    skynet: { ...internalProjectState },
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

export async function syncOpenSkynetLivingMemory(params: {
  workspaceRoot: string;
  sessionKey: string;
  snapshot: OmegaWorldModelSnapshot;
  operationalSummary?: OmegaOperationalMemorySummary;
  recommendedAction?: string;
  commitment?: SkynetCommitmentDecision;
  experiment?: SkynetExperimentPlan;
}): Promise<OpenSkynetLivingState> {
  const prior = await loadOpenSkynetLivingState(params);
  const project = await loadOpenSkynetInternalProjectProfile(params.workspaceRoot);
  const operationalSummary =
    params.operationalSummary ??
    (await loadOmegaOperationalMemorySummary({
      workspaceRoot: params.workspaceRoot,
      sessionKey: params.sessionKey,
    }).catch(() => undefined));
  const next = deriveLivingState({ ...params, project, operationalSummary });
  const statePath = resolveOpenSkynetLivingStateFile(params);
  await writeJsonAtomic(statePath, next, { trailingNewline: true });
  await appendOpenSkynetLivingMemoryEvents({
    historyPath: resolveOpenSkynetLivingHistoryFile(params.workspaceRoot),
    events: deriveOpenSkynetLivingMemoryEvents({
      sessionKey: params.sessionKey,
      prior,
      next,
    }),
  });
  return next;
}

export async function planOpenSkynetMemoryReset(params: {
  workspaceRoot: string;
  includeHumanReadable?: boolean;
}): Promise<string[]> {
  const omegaStateDir = resolveOmegaStateDir(params.workspaceRoot);
  const targets = [
    path.join(omegaStateDir, "living-memory"),
    path.join(omegaStateDir, "skynet-nucleus"),
    path.join(omegaStateDir, "skynet-study-program"),
    path.join(omegaStateDir, "skynet-continuity"),
    path.join(omegaStateDir, "skynet-commitment"),
    path.join(omegaStateDir, "skynet-experiments"),
    path.join(omegaStateDir, "skynet-artifacts"),
    path.join(omegaStateDir, "omega-study-supervisor"),
    path.join(omegaStateDir, "omega-executive-state"),
    path.join(omegaStateDir, "omega-problem-agenda"),
    path.join(omegaStateDir, "holographic-memory.json"),
    path.join(omegaStateDir, "omega-empirical-metrics.json"),
    path.join(omegaStateDir, "heartbeat.log"),
  ];
  if (params.includeHumanReadable) {
    targets.push(...HUMAN_READABLE_RESET_FILES.map((rel) => path.join(params.workspaceRoot, rel)));
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
