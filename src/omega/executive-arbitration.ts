import {
  computeOmegaUtilityBreakdown,
  deriveOmegaBudgetUsage,
  type OmegaBudgetUsage,
  type OmegaUtilityBreakdown,
} from "./executive-utility.js";
import type { OmegaMemoryOrchestratorSummary } from "./memory-orchestrator.js";
import type { OmegaWorldModelSnapshot } from "./world-model.js";

export type OmegaExecutiveMode = "idle" | "active" | "recovering";

export type OmegaExecutiveGoalKind = "user_task" | "self_repair" | "maintenance";

export type OmegaExecutiveGoalQueueItem = {
  goalId: string;
  task: string;
  kind: OmegaExecutiveGoalKind;
  priority: number;
  uncertainty: number;
  expectedUtility: number;
  estimatedCost: number;
  failureRisk: number;
};

export type OmegaExecutiveAnomaly = {
  kind: "repeated_failure" | "stalled_progress" | "memory_revalidation";
  severity: number;
  detail: string;
};

export type OmegaCognitiveBudget = {
  maxTurnsPerCycle: number;
  maxLlmCalls: number;
  maxWallTimeMs: number;
};

export type OmegaExecutiveDecision = {
  mode: OmegaExecutiveMode;
  selectedAction: "direct_execute" | "recover" | "maintain" | "idle";
  selectedGoalId?: string;
  rationale: string[];
  expectedUtility: number;
  utilityBreakdown: OmegaUtilityBreakdown;
  confidence: number;
  budget: OmegaCognitiveBudget;
  budgetUsage: OmegaBudgetUsage;
};

export type OmegaExecutiveObserverSnapshot = {
  mode: OmegaExecutiveMode;
  queue: OmegaExecutiveGoalQueueItem[];
  maintenanceQueue: OmegaExecutiveGoalQueueItem[];
  anomalies: OmegaExecutiveAnomaly[];
  decision: OmegaExecutiveDecision;
};

function buildDefaultBudget(mode: OmegaExecutiveMode): OmegaCognitiveBudget {
  switch (mode) {
    case "recovering":
      return { maxTurnsPerCycle: 2, maxLlmCalls: 2, maxWallTimeMs: 20_000 };
    case "active":
      return { maxTurnsPerCycle: 2, maxLlmCalls: 2, maxWallTimeMs: 15_000 };
    default:
      return { maxTurnsPerCycle: 1, maxLlmCalls: 0, maxWallTimeMs: 5_000 };
  }
}

function buildQueue(snapshot: OmegaWorldModelSnapshot): OmegaExecutiveGoalQueueItem[] {
  const goals = snapshot.kernel?.goals ?? [];
  const learnedConstraints = new Set(snapshot.selfState?.learnedConstraints ?? []);
  const activeTargets = snapshot.selfState?.activeTargets ?? [];
  return goals
    .filter((goal) => goal.status === "active")
    .map((goal) => {
      const requiresReframe =
        learnedConstraints.has("reframe_before_retry") &&
        snapshot.selfState?.activeGoal === goal.task;
      const narrowedTargetsActive =
        learnedConstraints.has("narrow_to_unresolved_targets") &&
        activeTargets.length > 0 &&
        activeTargets.length < goal.targets.length &&
        snapshot.selfState?.activeGoal === goal.task;
      const priorityBase = goal.failureCount > 0 ? 0.9 : 0.6;
      const expectedUtilityBase = goal.failureCount > 0 ? 0.85 : 0.72;
      const estimatedCostBase = goal.targets.length > 0 ? 0.45 : 0.25;
      const failureRiskBase = goal.failureCount > 0 ? 0.7 : 0.25;
      const applicableRecoveryPreference =
        snapshot.selfState?.activeGoal === goal.task
          ? (snapshot.activeRecoveryPreference ?? snapshot.generalizedRecoveryPreference)
          : undefined;
      const recoveryPrefersIsolation =
        applicableRecoveryPreference?.preferredRoute === "sessions_spawn";
      const recoveryPrefersLocal =
        applicableRecoveryPreference?.preferredRoute === "omega_delegate";
      const recoveryConfidence = applicableRecoveryPreference?.confidence ?? 0;
      return {
        goalId: goal.id,
        task: goal.task,
        kind: "user_task" as const,
        priority: requiresReframe
          ? Math.max(0.35, priorityBase - 0.18)
          : recoveryPrefersIsolation
            ? Math.max(0.3, priorityBase - 0.08 * recoveryConfidence)
            : priorityBase,
        uncertainty: goal.failureCount > goal.successCount ? 0.8 : 0.4,
        expectedUtility: requiresReframe
          ? Math.max(0.28, expectedUtilityBase - 0.22)
          : recoveryPrefersIsolation
            ? Math.max(0.24, expectedUtilityBase - 0.16 * recoveryConfidence)
            : recoveryPrefersLocal
              ? Math.min(0.95, expectedUtilityBase + 0.05 * recoveryConfidence)
              : expectedUtilityBase,
        estimatedCost: narrowedTargetsActive
          ? Math.max(0.12, estimatedCostBase - 0.12)
          : recoveryPrefersLocal
            ? Math.max(0.1, estimatedCostBase - 0.06 * recoveryConfidence)
            : recoveryPrefersIsolation
              ? Math.min(0.95, estimatedCostBase + 0.06 * recoveryConfidence)
              : estimatedCostBase,
        failureRisk: requiresReframe
          ? Math.min(0.95, failureRiskBase + 0.18)
          : recoveryPrefersIsolation
            ? Math.min(0.98, failureRiskBase + 0.14 * recoveryConfidence)
            : recoveryPrefersLocal
              ? Math.max(0.05, failureRiskBase - 0.06 * recoveryConfidence)
              : failureRiskBase,
      };
    })
    .sort((left, right) => {
      return (
        right.priority - left.priority ||
        right.expectedUtility - left.expectedUtility ||
        right.uncertainty - left.uncertainty
      );
    });
}

function scoreAgendaItem(item: OmegaWorldModelSnapshot["problemAgenda"][number]): number {
  const successBias = item.successCount * 0.08;
  const failurePenalty = item.failureCount * 0.1;
  const activationPenalty =
    item.activationCount > 0 ? Math.min(0.12, item.activationCount * 0.02) : 0;
  return (
    item.priority + item.realizedUtility * 0.35 + successBias - failurePenalty - activationPenalty
  );
}

function buildMaintenanceQueue(params: {
  snapshot: OmegaWorldModelSnapshot;
  memory: OmegaMemoryOrchestratorSummary;
}): OmegaExecutiveGoalQueueItem[] {
  const items: OmegaExecutiveGoalQueueItem[] = [];
  const recentStalledTurns = params.snapshot.operationalSignals.filter(
    (entry) => entry.turnHealth === "stalled",
  ).length;
  const topAgendaItem = [...params.snapshot.problemAgenda]
    .filter(
      (item) =>
        (item.status === "open" || item.status === "active") && scoreAgendaItem(item) > 0.18,
    )
    .sort(
      (left, right) =>
        scoreAgendaItem(right) - scoreAgendaItem(left) || right.lastSeenAt - left.lastSeenAt,
    )[0];

  if (recentStalledTurns >= 2) {
    items.push({
      goalId: "self_repair:stalled_progress",
      task: "Investigate stalled autonomous progress and reframe the active plan",
      kind: "self_repair",
      priority: 0.74,
      uncertainty: 0.82,
      expectedUtility: 0.68,
      estimatedCost: 0.28,
      failureRisk: 0.22,
    });
  }

  if (params.memory.revalidationCandidates > 0) {
    items.push({
      goalId: "memory:revalidate",
      task: "Revalidate durable memory patterns with repeated failures",
      kind: "maintenance",
      priority: 0.55,
      uncertainty: 0.65,
      expectedUtility: 0.45,
      estimatedCost: 0.2,
      failureRisk: 0.15,
    });
  }

  const repeatedFailureProbeEligible =
    topAgendaItem?.classKey.startsWith("failure:") === true &&
    (params.snapshot.kernel?.tension.failureStreak ?? 0) >= 2;
  if (
    topAgendaItem &&
    ((params.snapshot.kernel?.tension.openGoalCount ?? 0) === 0 || repeatedFailureProbeEligible)
  ) {
    const agendaScore = scoreAgendaItem(topAgendaItem);
    items.push({
      goalId: `agenda:${topAgendaItem.classKey}`,
      task: topAgendaItem.label,
      kind: "maintenance",
      priority: Math.max(0.25, Math.min(0.9, agendaScore)),
      uncertainty: Math.min(1, 0.38 + topAgendaItem.evidenceCount * 0.07),
      expectedUtility: Math.max(0.18, Math.min(0.88, 0.36 + agendaScore * 0.5)),
      estimatedCost: Math.max(0.14, 0.24 - Math.max(0, topAgendaItem.realizedUtility) * 0.06),
      failureRisk: Math.max(
        0.08,
        Math.min(
          0.72,
          0.2 + Math.max(0, topAgendaItem.failureCount - topAgendaItem.successCount) * 0.08,
        ),
      ),
    });
  }
  return items.sort(
    (left, right) => right.priority - left.priority || right.expectedUtility - left.expectedUtility,
  );
}

function buildAnomalies(params: {
  snapshot: OmegaWorldModelSnapshot;
  memory: OmegaMemoryOrchestratorSummary;
}): OmegaExecutiveAnomaly[] {
  const anomalies: OmegaExecutiveAnomaly[] = [];
  const failureStreak = params.snapshot.kernel?.tension.failureStreak ?? 0;
  const recentStalledTurns = params.snapshot.operationalSignals.filter(
    (entry) => entry.turnHealth === "stalled",
  ).length;

  if (failureStreak >= 2) {
    anomalies.push({
      kind: "repeated_failure",
      severity: Math.min(1, failureStreak / 3),
      detail: `failure_streak=${failureStreak}`,
    });
  }
  if (recentStalledTurns >= 2) {
    anomalies.push({
      kind: "stalled_progress",
      severity: Math.min(1, recentStalledTurns / 3),
      detail: `recent_stalled_turns=${recentStalledTurns}`,
    });
  }
  if (params.memory.revalidationCandidates > 0) {
    anomalies.push({
      kind: "memory_revalidation",
      severity: Math.min(1, params.memory.revalidationCandidates / 3),
      detail: `revalidation_candidates=${params.memory.revalidationCandidates}`,
    });
  }
  return anomalies.sort((left, right) => right.severity - left.severity);
}

export function observeOmegaExecutiveState(params: {
  snapshot: OmegaWorldModelSnapshot;
  memory: OmegaMemoryOrchestratorSummary;
}): OmegaExecutiveObserverSnapshot {
  const queue = buildQueue(params.snapshot);
  const maintenanceQueue = buildMaintenanceQueue({
    snapshot: params.snapshot,
    memory: params.memory,
  });
  const anomalies = buildAnomalies(params);

  let mode: OmegaExecutiveMode = "idle";
  let selectedAction: OmegaExecutiveDecision["selectedAction"] = "idle";
  const rationale: string[] = [];
  let selectedGoalId: string | undefined;
  let expectedUtility = 0.1;
  let confidence = 0.5;
  const provisionalBudget = buildDefaultBudget("idle");
  let budgetUsage = deriveOmegaBudgetUsage({
    operationalSignals: params.snapshot.operationalSignals,
    ...provisionalBudget,
  });
  let utilityBreakdown = computeOmegaUtilityBreakdown({
    urgency: 0,
    expectedUtility: 0.1,
    uncertaintyReduction: 0,
    estimatedCost: 0,
    failureRisk: 0,
    budgetPressure: budgetUsage.budgetPressure,
  });

  const failureProbeItem = maintenanceQueue.find((item) =>
    item.goalId.startsWith("agenda:failure:"),
  );

  if (anomalies.some((anomaly) => anomaly.kind === "repeated_failure") && failureProbeItem) {
    mode = "active";
    selectedAction = "maintain";
    selectedGoalId = failureProbeItem.goalId;
    rationale.push(
      "Repeated verified failures suggest a causal limit; run a probe experiment before another recovery attempt.",
    );
    expectedUtility = failureProbeItem.expectedUtility;
    confidence = 0.76;
  } else if (anomalies.some((anomaly) => anomaly.kind === "repeated_failure")) {
    mode = "recovering";
    selectedAction = "recover";
    selectedGoalId = queue[0]?.goalId;
    rationale.push("Repeated verified failures require recovery-first arbitration.");
    expectedUtility = queue[0]?.expectedUtility ?? 0.85;
    confidence = 0.78;
  } else if (anomalies.some((anomaly) => anomaly.kind === "stalled_progress")) {
    mode = "active";
    selectedAction = "maintain";
    selectedGoalId =
      maintenanceQueue.find((item) => item.kind === "self_repair")?.goalId ??
      maintenanceQueue[0]?.goalId;
    rationale.push(
      "Recent stalled turns require plan reframing before another direct execution attempt.",
    );
    expectedUtility =
      maintenanceQueue.find((item) => item.kind === "self_repair")?.expectedUtility ??
      maintenanceQueue[0]?.expectedUtility ??
      0.58;
    confidence = 0.7;
  } else if (queue.length > 0) {
    mode = "active";
    selectedAction = "direct_execute";
    selectedGoalId = queue[0]?.goalId;
    rationale.push("Active goals remain unresolved and should keep focus.");
    expectedUtility = queue[0]?.expectedUtility ?? 0.72;
    confidence = 0.74;
  } else if (maintenanceQueue.length > 0) {
    mode = "active";
    selectedAction = "maintain";
    selectedGoalId = maintenanceQueue[0]?.goalId;
    rationale.push(
      maintenanceQueue[0]?.goalId.startsWith("agenda:")
        ? "Persistent problem agenda suggests a proactive line worth reopening."
        : "Durable memory contains patterns that should be revalidated.",
    );
    expectedUtility = maintenanceQueue[0]?.expectedUtility ?? 0.45;
    confidence = maintenanceQueue[0]?.goalId.startsWith("agenda:") ? 0.6 : 0.64;
  } else {
    rationale.push("No urgent goals or anomalies justify a new autonomous action.");
  }

  const budget = buildDefaultBudget(mode);
  budgetUsage = deriveOmegaBudgetUsage({
    operationalSignals: params.snapshot.operationalSignals,
    ...budget,
  });
  const activeItem =
    selectedAction === "maintain"
      ? maintenanceQueue[0]
      : (queue.find((item) => item.goalId === selectedGoalId) ?? queue[0]);
  utilityBreakdown = computeOmegaUtilityBreakdown({
    urgency: activeItem?.priority ?? 0,
    expectedUtility,
    uncertaintyReduction: activeItem?.uncertainty ?? 0,
    estimatedCost: activeItem?.estimatedCost ?? 0,
    failureRisk: activeItem?.failureRisk ?? 0,
    budgetPressure: budgetUsage.budgetPressure,
  });
  expectedUtility = utilityBreakdown.total;
  if (budgetUsage.budgetPressure >= 0.95 && selectedAction === "direct_execute") {
    mode = "idle";
    selectedAction = "idle";
    selectedGoalId = undefined;
    rationale.push("Budget pressure is too high; defer direct execution work.");
    confidence = Math.min(confidence, 0.7);
  }

  return {
    mode,
    queue,
    maintenanceQueue,
    anomalies,
    decision: {
      mode,
      selectedAction,
      selectedGoalId,
      rationale,
      expectedUtility,
      utilityBreakdown,
      confidence,
      budget,
      budgetUsage,
    },
  };
}
