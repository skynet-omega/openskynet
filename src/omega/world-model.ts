import {
  loadOmegaDurableMemory,
  queryOmegaDurableMemory,
  type OmegaDurableMemoryEntry,
} from "./durable-memory.js";
import { loadOmegaEmpiricalMetrics } from "./empirical-metrics.js";
import type { OmegaSessionSelfState } from "./event-model.js";
import {
  loadOmegaOperationalMemory,
  type OmegaOperationalTurnMemoryEntry,
} from "./operational-memory.js";
import {
  loadOmegaProblemAgenda,
  syncOmegaProblemAgenda,
  type OmegaProblemAgendaItem,
} from "./problem-agenda.js";
import type { OmegaSelfTimeKernelState } from "./self-time-kernel.js";
import { loadOmegaSessionRuntimeSnapshot, loadOmegaSessionSelfState } from "./session-context.js";

type OmegaRecoveryPreference = {
  preferredRoute: "omega_delegate" | "sessions_spawn";
  confidence: number;
  delegateSuccesses: number;
  isolatedSuccesses: number;
};

type OmegaLocalityRoutingPreference = {
  preferredRoute: "omega_delegate" | "sessions_spawn";
  confidence: number;
  lowLocalityFailures: number;
  highLocalitySuccesses: number;
};

export type OmegaLocalityExecutionGuard = {
  shouldIsolate: boolean;
  confidence: number;
  evidenceCount: number;
  atRiskPaths: string[];
  reasons: string[];
};

export type OmegaWorldModelSnapshot = {
  sessionKey: string;
  kernel?: OmegaSelfTimeKernelState;
  selfState?: OmegaSessionSelfState;
  activeRecoveryPreference?: OmegaRecoveryPreference;
  generalizedRecoveryPreference?: OmegaRecoveryPreference & {
    mechanismKey: string;
  };
  localityRoutingPreference?: OmegaLocalityRoutingPreference;
  localityExecutionGuard?: OmegaLocalityExecutionGuard;
  problemAgenda: OmegaProblemAgendaItem[];
  timelineLength: number;
  activeGoalTask?: string;
  relevantMemories: OmegaDurableMemoryEntry[];
  operationalSignals: OmegaOperationalTurnMemoryEntry[];
};

function normalizeWorldModelText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function deriveConstraintBridgeMemories(params: {
  durableMemory: OmegaDurableMemoryEntry[];
  task?: string;
  expectedPaths?: string[];
}): OmegaDurableMemoryEntry[] {
  const task = params.task?.trim();
  const expectedPaths = new Set(
    (params.expectedPaths ?? []).map((value) => value.trim()).filter(Boolean),
  );
  if (!task && expectedPaths.size === 0) {
    return [];
  }
  const normalizedTask = task ? normalizeWorldModelText(task) : undefined;
  const taskTokens = normalizedTask
    ? normalizedTask.split(/[^a-z0-9]+/i).filter((token) => token.length >= 4)
    : [];

  return params.durableMemory.filter((entry) => {
    if ((entry.learnedConstraints?.length ?? 0) === 0) {
      return false;
    }
    const taskMatch = normalizedTask
      ? normalizeWorldModelText(entry.task).includes(normalizedTask) ||
        normalizedTask.includes(normalizeWorldModelText(entry.task)) ||
        taskTokens.some((token) => normalizeWorldModelText(entry.task).includes(token))
      : false;
    const pathMatch =
      expectedPaths.size > 0 && entry.targets.some((target) => expectedPaths.has(target));
    return taskMatch || pathMatch;
  });
}

function deriveRecoveryScope(params: { targetCount: number; expectsJson: boolean }): string {
  return params.targetCount > 1
    ? "multi_target"
    : params.targetCount === 1
      ? "single_target"
      : params.expectsJson
        ? "structured_only"
        : "general";
}

function deriveRecoveryStrategyKey(params: {
  errorKind?: string;
  targetCount: number;
  collateralCount: number;
  expectsJson: boolean;
  route: "omega_delegate" | "sessions_spawn";
}): string {
  const scope = deriveRecoveryScope({
    targetCount: params.targetCount,
    expectsJson: params.expectsJson,
  });
  const collateral = params.collateralCount > 0 ? "collateral" : "contained";
  return `${params.errorKind ?? "unknown"}|${scope}|${collateral}|${params.route}`;
}

function buildRecoveryPreference(params: {
  delegateSuccesses: number;
  isolatedSuccesses: number;
}): OmegaRecoveryPreference | undefined {
  if (params.delegateSuccesses === 0 && params.isolatedSuccesses === 0) {
    return undefined;
  }
  const preferredRoute =
    params.delegateSuccesses >= params.isolatedSuccesses ? "omega_delegate" : "sessions_spawn";
  const totalSuccesses = params.delegateSuccesses + params.isolatedSuccesses;
  const confidence =
    totalSuccesses > 0
      ? Math.max(params.delegateSuccesses, params.isolatedSuccesses) / totalSuccesses
      : 0;
  return {
    preferredRoute,
    confidence,
    delegateSuccesses: params.delegateSuccesses,
    isolatedSuccesses: params.isolatedSuccesses,
  };
}

function deriveLocalityRoutingPreference(
  relevantMemories: OmegaDurableMemoryEntry[],
): OmegaWorldModelSnapshot["localityRoutingPreference"] {
  let lowLocalityFailures = 0;
  let highLocalitySuccesses = 0;

  for (const memory of relevantMemories) {
    const localityScore = memory.localityScore;
    const preservationRate = memory.protectedPreservationRate;
    if (typeof localityScore !== "number" || typeof preservationRate !== "number") {
      continue;
    }
    if (memory.kind === "repeated_failure" && localityScore < 0.5 && preservationRate < 0.75) {
      lowLocalityFailures += Math.max(memory.failureCount, 1);
    }
    if (memory.kind === "verified_success" && localityScore >= 0.8 && preservationRate >= 0.9) {
      highLocalitySuccesses += Math.max(memory.successCount, 1);
    }
  }

  const totalSignals = lowLocalityFailures + highLocalitySuccesses;
  if (totalSignals < 2) {
    return undefined;
  }

  if (lowLocalityFailures > highLocalitySuccesses) {
    return {
      preferredRoute: "sessions_spawn",
      confidence: Math.min(0.95, lowLocalityFailures / totalSignals),
      lowLocalityFailures,
      highLocalitySuccesses,
    };
  }
  if (highLocalitySuccesses > lowLocalityFailures) {
    return {
      preferredRoute: "omega_delegate",
      confidence: Math.min(0.95, highLocalitySuccesses / totalSignals),
      lowLocalityFailures,
      highLocalitySuccesses,
    };
  }
  return undefined;
}

function deriveLocalityExecutionGuard(params: {
  relevantMemories: OmegaDurableMemoryEntry[];
  expectedPaths?: string[];
  watchedPaths?: string[];
}): OmegaWorldModelSnapshot["localityExecutionGuard"] {
  const expectedPaths = new Set(params.expectedPaths ?? []);
  const protectedPaths = Array.from(
    new Set((params.watchedPaths ?? []).filter((candidate) => !expectedPaths.has(candidate))),
  );
  if (protectedPaths.length === 0) {
    return undefined;
  }

  let evidenceCount = 0;
  const atRiskPaths = new Set<string>();
  const reasons = new Set<string>();

  for (const memory of params.relevantMemories) {
    if (memory.kind !== "repeated_failure") {
      continue;
    }
    const localityScore = memory.localityScore;
    const preservationRate = memory.protectedPreservationRate;
    const touchedProtected = protectedPaths.filter((candidate) =>
      memory.observedChangedFiles.includes(candidate),
    );
    if (touchedProtected.length === 0) {
      continue;
    }
    if (
      memory.errorKind === "unexpected_collateral_writes" ||
      (typeof localityScore === "number" &&
        typeof preservationRate === "number" &&
        localityScore < 0.5 &&
        preservationRate < 0.75)
    ) {
      evidenceCount += Math.max(memory.failureCount, 1);
      for (const candidate of touchedProtected) {
        atRiskPaths.add(candidate);
      }
      reasons.add(memory.errorKind ?? "low_locality_failure");
    }
  }

  if (evidenceCount < 2 || atRiskPaths.size === 0) {
    return undefined;
  }

  return {
    shouldIsolate: true,
    confidence: Math.min(0.95, 0.6 + evidenceCount * 0.1),
    evidenceCount,
    atRiskPaths: Array.from(atRiskPaths).sort(),
    reasons: Array.from(reasons).sort(),
  };
}

function deriveGeneralizedRecoveryPreference(params: {
  kernel?: OmegaSelfTimeKernelState;
  metrics: Awaited<ReturnType<typeof loadOmegaEmpiricalMetrics>>;
}): OmegaWorldModelSnapshot["generalizedRecoveryPreference"] {
  const kernel = params.kernel;
  const activeGoal = kernel?.activeGoalId
    ? kernel.goals.find((goal) => goal.id === kernel.activeGoalId)
    : undefined;
  const errorKind = activeGoal?.lastErrorKind ?? kernel?.world.lastErrorKind;
  if (!errorKind) {
    return undefined;
  }
  const scope = deriveRecoveryScope({
    targetCount: activeGoal?.targets.length ?? 0,
    expectsJson:
      (activeGoal?.requiredKeys.length ?? 0) > 0 || errorKind === "invalid_structured_result",
  });
  const mechanismKey = `${errorKind}|${scope}`;
  let delegateSuccesses = 0;
  let isolatedSuccesses = 0;
  for (const [key, value] of Object.entries(params.metrics.recovery.strategies)) {
    if (!key.startsWith(`${mechanismKey}|`)) {
      continue;
    }
    if (key.endsWith("|omega_delegate")) {
      delegateSuccesses += value.successes;
    }
    if (key.endsWith("|sessions_spawn")) {
      isolatedSuccesses += value.successes;
    }
  }
  const preference = buildRecoveryPreference({ delegateSuccesses, isolatedSuccesses });
  return preference ? { ...preference, mechanismKey } : undefined;
}

function deriveActiveRecoveryPreference(params: {
  kernel?: OmegaSelfTimeKernelState;
  metrics: Awaited<ReturnType<typeof loadOmegaEmpiricalMetrics>>;
}): OmegaWorldModelSnapshot["activeRecoveryPreference"] {
  const kernel = params.kernel;
  if (!kernel?.activeGoalId) {
    return undefined;
  }
  const activeGoal = kernel.goals.find((goal) => goal.id === kernel.activeGoalId);
  if (!activeGoal || activeGoal.status !== "active") {
    return undefined;
  }
  const collateralCount = activeGoal.observedChangedFiles.filter(
    (path) => !activeGoal.targets.includes(path),
  ).length;
  const errorKind = activeGoal.lastErrorKind ?? kernel.world.lastErrorKind;
  const expectsJson =
    activeGoal.requiredKeys.length > 0 || errorKind === "invalid_structured_result";
  const delegateKey = deriveRecoveryStrategyKey({
    errorKind,
    targetCount: activeGoal.targets.length,
    collateralCount,
    expectsJson,
    route: "omega_delegate",
  });
  const isolationKey = deriveRecoveryStrategyKey({
    errorKind,
    targetCount: activeGoal.targets.length,
    collateralCount,
    expectsJson,
    route: "sessions_spawn",
  });
  const delegate = params.metrics.recovery.strategies[delegateKey];
  const isolated = params.metrics.recovery.strategies[isolationKey];
  const delegateSuccesses = delegate?.successes ?? 0;
  const isolatedSuccesses = isolated?.successes ?? 0;
  return buildRecoveryPreference({ delegateSuccesses, isolatedSuccesses });
}

export async function loadOmegaWorldModelSnapshot(params: {
  workspaceRoot: string;
  sessionKey: string;
  task?: string;
  expectedPaths?: string[];
  watchedPaths?: string[];
}): Promise<OmegaWorldModelSnapshot> {
  const [runtime, selfState, empiricalMetrics] = await Promise.all([
    loadOmegaSessionRuntimeSnapshot(params),
    loadOmegaSessionSelfState(params),
    loadOmegaEmpiricalMetrics({ workspaceRoot: params.workspaceRoot }),
  ]);
  const allDurableMemory = await loadOmegaDurableMemory(params);
  const relevantMemories =
    params.task && params.task.trim().length > 0
      ? await queryOmegaDurableMemory({
          workspaceRoot: params.workspaceRoot,
          sessionKey: params.sessionKey,
          task: params.task,
          expectedPaths: params.expectedPaths,
          maxResults: 4,
        })
      : allDurableMemory.slice(0, 4);
  const operationalSignals = (await loadOmegaOperationalMemory(params)).slice(-3).reverse();
  const problemAgenda = await syncOmegaProblemAgenda({
    workspaceRoot: params.workspaceRoot,
    sessionKey: params.sessionKey,
    kernel: runtime.kernel,
    durableMemory: allDurableMemory,
    operationalSignals,
  }).catch(() => loadOmegaProblemAgenda(params));
  const activeGoalTask = runtime.kernel?.goals.find(
    (goal) => goal.id === runtime.kernel?.activeGoalId,
  )?.task;

  // Inherit constraints from Durable Memory (The Bridge)
  const constraintBridgeMemories = deriveConstraintBridgeMemories({
    durableMemory: allDurableMemory,
    task: params.task,
    expectedPaths: params.expectedPaths,
  });
  const inheritedConstraints = [...relevantMemories, ...constraintBridgeMemories].flatMap(
    (m) => m.learnedConstraints ?? [],
  );
  const mergedLearnedConstraints = Array.from(
    new Set([...(selfState?.learnedConstraints ?? []), ...inheritedConstraints]),
  ).slice(-6); // OMEGA_STATE_CONSTRAINT_LIMIT equivalent

  const enrichedSelfState: OmegaSessionSelfState | undefined = selfState
    ? {
        ...selfState,
        learnedConstraints: mergedLearnedConstraints,
      }
    : inheritedConstraints.length > 0
      ? {
          activeTargets: params.expectedPaths ?? [],
          requiredKeys: [],
          learnedConstraints: mergedLearnedConstraints,
          updatedAt: Date.now(),
        }
      : undefined;

  return {
    sessionKey: params.sessionKey,
    kernel: runtime.kernel,
    selfState: enrichedSelfState,
    activeRecoveryPreference: deriveActiveRecoveryPreference({
      kernel: runtime.kernel,
      metrics: empiricalMetrics,
    }),
    generalizedRecoveryPreference: deriveGeneralizedRecoveryPreference({
      kernel: runtime.kernel,
      metrics: empiricalMetrics,
    }),
    localityRoutingPreference: deriveLocalityRoutingPreference(relevantMemories),
    localityExecutionGuard: deriveLocalityExecutionGuard({
      relevantMemories,
      expectedPaths: params.expectedPaths,
      watchedPaths: params.watchedPaths,
    }),
    problemAgenda,
    timelineLength: runtime.timeline.length,
    activeGoalTask,
    relevantMemories,
    operationalSignals,
  };
}

export function formatOmegaWorldModelSnapshot(snapshot: OmegaWorldModelSnapshot): string[] {
  const lines = ["[OMEGA World Model]"];
  if (!snapshot.kernel) {
    lines.push("Kernel state: unavailable");
  } else {
    lines.push(`Continuity: ${snapshot.kernel.identity.continuityId}`);
    lines.push(`Turns observed: ${snapshot.kernel.turnCount}`);
    lines.push(`Open goals: ${snapshot.kernel.tension.openGoalCount}`);
    lines.push(`Failure streak: ${snapshot.kernel.tension.failureStreak}`);
    if (snapshot.activeGoalTask) {
      lines.push(`Active goal: ${snapshot.activeGoalTask}`);
    }
    if (snapshot.kernel.world.lastOutcomeStatus) {
      lines.push(`Last outcome: ${snapshot.kernel.world.lastOutcomeStatus}`);
    }
    if (snapshot.kernel.world.lastObservedChangedFiles.length > 0) {
      lines.push(`Recent writes: ${snapshot.kernel.world.lastObservedChangedFiles.join(", ")}`);
    }
  }
  lines.push(`Timeline entries: ${snapshot.timelineLength}`);
  if (snapshot.selfState?.learnedConstraints?.length) {
    lines.push(`Learned constraints: ${snapshot.selfState.learnedConstraints.join(", ")}`);
  }
  if (snapshot.activeRecoveryPreference) {
    lines.push(
      `Recovery preference: ${snapshot.activeRecoveryPreference.preferredRoute} (confidence ${snapshot.activeRecoveryPreference.confidence.toFixed(2)})`,
    );
  }
  if (snapshot.generalizedRecoveryPreference) {
    lines.push(
      `Generalized recovery preference: ${snapshot.generalizedRecoveryPreference.preferredRoute} for ${snapshot.generalizedRecoveryPreference.mechanismKey}`,
    );
  }
  if (snapshot.localityRoutingPreference) {
    lines.push(
      `Locality preference: ${snapshot.localityRoutingPreference.preferredRoute} (confidence ${snapshot.localityRoutingPreference.confidence.toFixed(2)})`,
    );
  }
  if (snapshot.localityExecutionGuard?.shouldIsolate) {
    lines.push(
      `Locality guard: isolate edits touching protected paths ${snapshot.localityExecutionGuard.atRiskPaths.join(", ")}`,
    );
  }
  if (snapshot.problemAgenda.length > 0) {
    lines.push(
      `Open problem classes: ${snapshot.problemAgenda
        .slice(0, 2)
        .map((item) => item.classKey)
        .join(", ")}`,
    );
  }
  if (snapshot.relevantMemories.length > 0) {
    lines.push("");
    lines.push("[OMEGA Durable Memory]");
    snapshot.relevantMemories.forEach((entry, index) => {
      const targetSummary = entry.targets.length > 0 ? ` -> ${entry.targets.join(", ")}` : "";
      const outcomeSummary =
        entry.kind === "verified_success"
          ? `success x${entry.successCount}`
          : `failure x${entry.failureCount}${entry.errorKind ? ` (${entry.errorKind})` : ""}`;
      lines.push(`${index + 1}. ${entry.task}${targetSummary} [${outcomeSummary}]`);
    });
  }
  if (snapshot.operationalSignals.length > 0) {
    lines.push("");
    lines.push("[OMEGA Operational Memory]");
    snapshot.operationalSignals.forEach((entry, index) => {
      lines.push(
        `${index + 1}. iter=${entry.iteration} ${entry.turnHealth} termination=${entry.terminationReason} progress=${entry.progressObserved ? "yes" : "no"} latency=${entry.latencyBreakdown.totalMs}ms`,
      );
    });
  }
  return lines;
}
