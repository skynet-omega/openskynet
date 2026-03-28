import fs from "node:fs/promises";
import path from "node:path";
import { writeJsonAtomic } from "../../src/infra/json-files.js";
import {
  deriveOpenSkynetInternalProjectBenchmarkAcceptance,
  loadOpenSkynetInternalProjectBenchmarkAudits,
  loadOpenSkynetInternalProjectLastCycleResult,
  resolveInternalProjectPolicyCandidateFile,
  resolveInternalProjectBenchmarkResultFile,
  resolveInternalProjectBenchmarkSnapshotFile,
  type OpenSkynetInternalProjectBenchmarkAcceptance,
  type OpenSkynetInternalProjectBenchmarkPolicy,
  type OpenSkynetInternalProjectBenchmarkStatus,
  type OpenSkynetInternalProjectCycleResultKind,
} from "../../src/omega/internal-project.js";
import { resolveOmegaStateDir } from "../../src/omega/paths.js";
import { loadOmegaSelfTimeRuntimeState } from "../../src/omega/self-time-daemon.js";
import type { OpenSkynetRuntimeAuthority } from "./runtime-authority.js";
import { syncOpenSkynetRuntimeAuthority } from "./runtime-authority.js";

export type OpenSkynetBenchmarkCycleSnapshot = {
  sessionKey: string;
  updatedAt: number;
  project: {
    key: string;
    name: string;
    role: string;
    mission: string;
    benchmarkPurpose: string;
    successCriteria: string[];
    benchmarkPolicy: OpenSkynetInternalProjectBenchmarkPolicy;
  };
  benchmark: {
    score: number;
    continuityScore: number | null;
    focusKey: string | null;
    focusTitle: string | null;
    mode: string | null;
    topWorkItem: string | null;
    recommendedAction: string | null;
    commitmentTask: string | null;
    deliverable: string | null;
    benchmarkHook: string | null;
  };
  coldDirective: {
    action: "recover" | "maintain" | "advance" | "stop";
    reason: string;
    confidence: number;
    llmMode: "minimize" | "assist";
    allowHotPath: boolean;
    enforcedWorkItemId?: string;
    enforcedWorkItemDetail?: string;
    maintenanceItemId?: string;
    maintenanceDetail?: string;
  };
  runtime: {
    authorityStateFile: string;
    livingHistoryFile: string;
    benchmarkSnapshotFile: string;
    artifactStateDir: string;
    cycleResultFile: string;
  };
  cycleRules: {
    oneConcreteStepOnly: true;
    doNotBroadScanWorkspace: true;
    doNotInferMissingStateFiles: true;
    benchmarkSnapshotIsDerived: true;
    writeCycleResultTo: string;
    resultKinds: Array<"artifact" | "measurement" | "improvement" | "no-progress">;
    resultFormat: string;
  };
  reportingRules: {
    sourcePriority: string[];
    doNotCiteAsPresentState: string[];
    forbiddenClaims: string[];
    migrationDirective: string;
    tone: "sober";
  };
  selfTime?: {
    tickCount: number;
    continuousMinutes: number;
    latestPredictionError: number;
    averagePredictionError: number;
    latestNleConfidence: number;
    latestNleActionBias: string;
  };
  policyMutation?: {
    candidateFile: string;
    activeCandidateId?: string;
  };
  metabolism: OpenSkynetInternalProjectBenchmarkStatus;
  acceptance: OpenSkynetInternalProjectBenchmarkAcceptance;
};

export function resolveOpenSkynetBenchmarkCycleFile(params: {
  workspaceRoot: string;
  sessionKey: string;
}): string {
  return resolveInternalProjectBenchmarkSnapshotFile(params);
}

export function resolveOpenSkynetBenchmarkCycleResultFile(params: {
  workspaceRoot: string;
  sessionKey: string;
}): string {
  return resolveInternalProjectBenchmarkResultFile(params);
}

const DEFAULT_BENCHMARK_STATUS: OpenSkynetInternalProjectBenchmarkStatus = {
  evaluatedCycleCount: 0,
  lastEvaluatedCycleId: null,
  lastResultKind: null,
  lastArtifactRef: null,
  noProgressStreak: 0,
  cyclesSinceImprovement: 0,
  cyclesSinceArtifact: 0,
  budgetStatus: "healthy",
  killRecommended: false,
  killReason: null,
};

function deriveBudgetStatus(params: {
  next: OpenSkynetInternalProjectBenchmarkStatus;
  policy: OpenSkynetInternalProjectBenchmarkPolicy;
}): Pick<
  OpenSkynetInternalProjectBenchmarkStatus,
  "budgetStatus" | "killRecommended" | "killReason"
> {
  const reasons: string[] = [];
  const warning =
    params.next.noProgressStreak >= Math.max(1, params.policy.maxNoProgressCycles - 1) ||
    params.next.cyclesSinceImprovement >=
      Math.max(1, params.policy.maxCyclesWithoutImprovement - 1) ||
    params.next.cyclesSinceArtifact >= Math.max(1, params.policy.maxCyclesWithoutArtifact - 1);

  if (params.next.noProgressStreak >= params.policy.maxNoProgressCycles) {
    reasons.push("no_progress_budget_exhausted");
  }
  if (params.next.cyclesSinceImprovement >= params.policy.maxCyclesWithoutImprovement) {
    reasons.push("improvement_budget_exhausted");
  }
  if (params.next.cyclesSinceArtifact >= params.policy.maxCyclesWithoutArtifact) {
    reasons.push("artifact_budget_exhausted");
  }

  if (reasons.length > 0) {
    return {
      budgetStatus: "exhausted",
      killRecommended: true,
      killReason: reasons.join("+"),
    };
  }

  return {
    budgetStatus: warning ? "warning" : "healthy",
    killRecommended: false,
    killReason: null,
  };
}

function deriveOpenSkynetBenchmarkStatus(params: {
  previous: OpenSkynetInternalProjectBenchmarkStatus | null;
  policy: OpenSkynetInternalProjectBenchmarkPolicy;
  cycleResult: Awaited<ReturnType<typeof loadOpenSkynetInternalProjectLastCycleResult>>;
  enforcedWorkItemId?: string;
}): OpenSkynetInternalProjectBenchmarkStatus {
  const previous = params.previous ?? DEFAULT_BENCHMARK_STATUS;
  const cycleId = params.cycleResult?.cycleId?.trim() || null;
  const kind =
    ((params.cycleResult?.result &&
      typeof params.cycleResult.result === "object" &&
      params.cycleResult.result.kind) as OpenSkynetInternalProjectCycleResultKind | undefined) ??
    params.cycleResult?.resultKind ??
    null;
  const artifactRef =
    (params.cycleResult?.result &&
    typeof params.cycleResult.result === "object" &&
    typeof params.cycleResult.result.artifactRef === "string"
      ? params.cycleResult.result.artifactRef
      : undefined) ??
    params.cycleResult?.artifactRef ??
    null;

  const autonomyImprovementContext =
    params.enforcedWorkItemId === "maintenance:agenda:initiative:autonomy_improvement" ||
    params.cycleResult?.enforcedWorkItemId === "maintenance:agenda:initiative:autonomy_improvement";
  const qualifiesAsAutonomyImprovementResult =
    autonomyImprovementContext && (kind === "artifact" || kind === "measurement");

  if (!cycleId) {
    return previous;
  }

  const canReevaluatePreviousCycle =
    previous.lastEvaluatedCycleId === cycleId &&
    previous.cyclesSinceImprovement > 0 &&
    qualifiesAsAutonomyImprovementResult;

  if (previous.lastEvaluatedCycleId === cycleId && !canReevaluatePreviousCycle) {
    return previous;
  }
  const countsAsImprovement =
    kind === "improvement" ||
    (kind === "measurement" && params.policy.measurementResetsImprovementStreak) ||
    qualifiesAsAutonomyImprovementResult;
  const countsAsArtifact = kind === "artifact" || kind === "improvement";

  const nextBase: OpenSkynetInternalProjectBenchmarkStatus = {
    evaluatedCycleCount: previous.evaluatedCycleCount + 1,
    lastEvaluatedCycleId: cycleId,
    lastResultKind: kind,
    lastArtifactRef: artifactRef,
    noProgressStreak: kind === "no-progress" ? previous.noProgressStreak + 1 : 0,
    cyclesSinceImprovement: countsAsImprovement ? 0 : previous.cyclesSinceImprovement + 1,
    cyclesSinceArtifact: countsAsArtifact ? 0 : previous.cyclesSinceArtifact + 1,
    budgetStatus: "healthy",
    killRecommended: false,
    killReason: null,
  };

  return {
    ...nextBase,
    ...deriveBudgetStatus({
      next: nextBase,
      policy: params.policy,
    }),
  };
}

async function deriveOpenSkynetBenchmarkCycleSnapshot(
  workspaceRoot: string,
  runtimeAuthority: OpenSkynetRuntimeAuthority,
  benchmarkSnapshotFile: string,
): Promise<OpenSkynetBenchmarkCycleSnapshot> {
  const stateFile = path.join(
    resolveOmegaStateDir(workspaceRoot),
    "living-memory",
    "state",
    `${runtimeAuthority.sessionKey.replace(/[^a-zA-Z0-9._-]+/g, "_")}.json`,
  );
  const cycleResultFile = resolveOpenSkynetBenchmarkCycleResultFile({
    workspaceRoot,
    sessionKey: runtimeAuthority.sessionKey,
  });
  const [previousSnapshotRaw, cycleResult, audits, selfTimeState] = await Promise.all([
    fs
      .readFile(benchmarkSnapshotFile, "utf-8")
      .then(
        (raw) =>
          JSON.parse(raw) as {
            metabolism?: OpenSkynetInternalProjectBenchmarkStatus;
          },
      )
      .catch(() => null),
    loadOpenSkynetInternalProjectLastCycleResult({
      workspaceRoot,
      sessionKey: runtimeAuthority.sessionKey,
    }),
    loadOpenSkynetInternalProjectBenchmarkAudits({
      workspaceRoot,
      sessionKey: runtimeAuthority.sessionKey,
      limit: runtimeAuthority.project.benchmarkPolicy.acceptanceWindowRuns,
    }),
    loadOmegaSelfTimeRuntimeState({
      workspaceRoot,
      sessionKey: runtimeAuthority.sessionKey,
    }),
  ]);
  const metabolism = deriveOpenSkynetBenchmarkStatus({
    previous: previousSnapshotRaw?.metabolism ?? null,
    policy: runtimeAuthority.project.benchmarkPolicy,
    cycleResult,
    enforcedWorkItemId: runtimeAuthority.coldDirective.enforcedWorkItemId,
  });
  const acceptance = deriveOpenSkynetInternalProjectBenchmarkAcceptance({
    audits,
    policy: runtimeAuthority.project.benchmarkPolicy,
  });

  return {
    sessionKey: runtimeAuthority.sessionKey,
    updatedAt: Date.now(),
    project: {
      key: runtimeAuthority.project.key,
      name: runtimeAuthority.project.name,
      role: runtimeAuthority.project.role,
      mission: runtimeAuthority.project.mission,
      benchmarkPurpose: runtimeAuthority.project.benchmarkPurpose,
      successCriteria: runtimeAuthority.project.successCriteria,
      benchmarkPolicy: runtimeAuthority.project.benchmarkPolicy,
    },
    benchmark: {
      score: runtimeAuthority.livingState.agenticBenchmark.benchmarkScore,
      continuityScore: runtimeAuthority.livingState.agenticBenchmark.continuityScore,
      focusKey: runtimeAuthority.livingState.internalProjectState.focusKey,
      focusTitle: runtimeAuthority.livingState.internalProjectState.focusTitle,
      mode: runtimeAuthority.livingState.internalProjectState.mode,
      topWorkItem: runtimeAuthority.livingState.internalProjectState.topWorkItem,
      recommendedAction: runtimeAuthority.livingState.internalProjectState.recommendedAction,
      commitmentTask:
        runtimeAuthority.livingState.internalProjectState.commitment?.executableTask ?? null,
      deliverable:
        runtimeAuthority.livingState.internalProjectState.experiment?.deliverable ?? null,
      benchmarkHook:
        runtimeAuthority.livingState.internalProjectState.experiment?.benchmarkHook ?? null,
    },
    coldDirective: runtimeAuthority.coldDirective,
    runtime: {
      authorityStateFile: stateFile,
      livingHistoryFile: path.join(
        resolveOmegaStateDir(workspaceRoot),
        "living-memory",
        "history.jsonl",
      ),
      benchmarkSnapshotFile,
      artifactStateDir: path.join(resolveOmegaStateDir(workspaceRoot), "skynet-artifacts"),
      cycleResultFile,
    },
    cycleRules: {
      oneConcreteStepOnly: true,
      doNotBroadScanWorkspace: true,
      doNotInferMissingStateFiles: true,
      benchmarkSnapshotIsDerived: true,
      writeCycleResultTo: cycleResultFile,
      resultKinds: ["artifact", "measurement", "improvement", "no-progress"],
      resultFormat:
        "RESULT: <artifact|measurement|improvement|no-progress>; IMPACT: <one line>; NEXT: <one line>",
    },
    reportingRules: {
      sourcePriority: [
        ".openskynet/internal-project-benchmark/*.json",
        ".openskynet/living-memory/state/*.json",
        ".openskynet/living-memory/history.jsonl",
        ".openskynet/skynet-*/*.json",
        "INTERNAL_PROJECT.json",
      ],
      doNotCiteAsPresentState: [
        "memory/YYYY-MM-DD.md",
        "memory/SKYNET_RESEARCH_HARVEST.md",
        "memory/SKYNET_FOCAL_POINT.md",
        "memory/SKYNET_BENCHMARK_HARDENING.md",
      ],
      forbiddenClaims: [
        "maxima estabilidad estructural",
        "no hay alucinacion de contexto",
        "he confirmado",
        "prueba que",
        "voluntad",
        "conciencia",
        "soberania total",
      ],
      migrationDirective:
        "If the internal project yields a platform-worthy improvement, migrate it into the official OpenSkyNet/Omega runtime and keep the benchmark implementation optional.",
      tone: "sober",
    },
    selfTime: selfTimeState
      ? {
          tickCount: selfTimeState.tickCount,
          continuousMinutes: selfTimeState.continuousMinutes,
          latestPredictionError: selfTimeState.latestPredictionError,
          averagePredictionError: selfTimeState.averagePredictionError,
          latestNleConfidence: selfTimeState.latestNleConfidence,
          latestNleActionBias: selfTimeState.latestNleActionBias,
        }
      : undefined,
    policyMutation: {
      candidateFile: resolveInternalProjectPolicyCandidateFile(workspaceRoot),
      activeCandidateId: selfTimeState?.activePolicyCandidateId,
    },
    metabolism,
    acceptance,
  };
}

export async function writeOpenSkynetBenchmarkCycleSnapshot(params: {
  workspaceRoot: string;
  runtimeAuthority: OpenSkynetRuntimeAuthority;
}): Promise<OpenSkynetBenchmarkCycleSnapshot> {
  const filePath = resolveOpenSkynetBenchmarkCycleFile({
    workspaceRoot: params.workspaceRoot,
    sessionKey: params.runtimeAuthority.sessionKey,
  });
  const snapshot = await deriveOpenSkynetBenchmarkCycleSnapshot(
    params.workspaceRoot,
    params.runtimeAuthority,
    filePath,
  );
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await writeJsonAtomic(filePath, snapshot);
  return snapshot;
}

export async function syncOpenSkynetBenchmarkCycleSnapshot(params: {
  workspaceRoot: string;
  sessionKey: string;
}): Promise<OpenSkynetBenchmarkCycleSnapshot> {
  const runtimeAuthority = await syncOpenSkynetRuntimeAuthority(params);
  return writeOpenSkynetBenchmarkCycleSnapshot({
    workspaceRoot: params.workspaceRoot,
    runtimeAuthority,
  });
}
