import { loadOmegaEmpiricalMetrics } from "./empirical-metrics.js";
import {
  buildOmegaRecoveryStrategyKey,
  chooseOmegaRecoveryRoute,
  decideOmegaWorkPolicyRoute,
  deriveOmegaEmpiricalRoutingPreference,
  deriveOmegaExecutiveRoutingDirective,
  type OmegaEmpiricalRoutingPreference,
  type OmegaExecutiveRoutingDirective,
  type OmegaRecoveryRouteDecision,
  type OmegaWorkPolicyRoute,
} from "./execution-policy.js";
import type { OmegaExecutiveScheduledItem } from "./executive-runtime.js";
import { syncOmegaExecutiveObserverState, type OmegaExecutiveState } from "./executive-state.js";
import type { OmegaWakeAction } from "./frontal/wake-policy.js";
import {
  loadOmegaOperationalMemory,
  loadOmegaOperationalMemorySummary,
  type OmegaOperationalMemorySummary,
} from "./operational-memory.js";
import type { OmegaInterruptedGoalRecovery } from "./types.js";
import { loadOmegaWorldModelSnapshot, type OmegaWorldModelSnapshot } from "./world-model.js";

export type OmegaExecutionControllerState = {
  executiveState: OmegaExecutiveState;
  dispatchPlan: OmegaExecutiveState["runtime"]["dispatchPlan"];
  selectedWorkItem?: OmegaExecutiveScheduledItem;
  hasUrgentMaintenance: boolean;
  operationalSummary?: OmegaOperationalMemorySummary;
  worldSnapshot?: OmegaWorldModelSnapshot;
};

export type OmegaValidatedExecutionPreflight = {
  verdict: "allow" | "isolate";
  reason: "none" | "locality_guard" | "science_law_limit";
  confidence: number;
  violatedLaw?: string;
};

export type OmegaHeartbeatCorrectiveControl =
  | { kind: "none"; wakeAction: OmegaWakeAction }
  | {
      kind: "prune_stale_goals";
      wakeAction: Extract<OmegaWakeAction, { kind: "prune_stale_goals" }>;
    }
  | {
      kind: "prune_superseded_goals";
      wakeAction: Extract<OmegaWakeAction, { kind: "prune_superseded_goals" }>;
    }
  | {
      kind: "prune_shadowed_goals";
      wakeAction: Extract<OmegaWakeAction, { kind: "prune_shadowed_goals" }>;
    }
  | {
      kind: "focus_active_goal_targets";
      wakeAction: Extract<OmegaWakeAction, { kind: "focus_active_goal_targets" }>;
    }
  | {
      kind: "reframe_stalled_goal";
      wakeAction: Extract<
        OmegaWakeAction,
        { kind: "review_active_goal" | "focus_active_goal_targets" }
      >;
    }
  | {
      kind: "resume_interrupted_goal";
      wakeAction: Extract<OmegaWakeAction, { kind: "resume_interrupted_goal" }>;
    }
  | {
      kind: "abort_interrupted_goal";
      wakeAction: Extract<OmegaWakeAction, { kind: "abort_interrupted_goal" }>;
    };

function isUrgentMaintenanceWorkItem(item?: OmegaExecutiveScheduledItem): boolean {
  return Boolean(
    item?.id.startsWith("maintenance:agenda:") ||
    item?.id.startsWith("maintenance:failure:") ||
    item?.id.startsWith("maintenance:stalled_progress:"),
  );
}

function shouldReloadWorldSnapshotForTaskContext(params: {
  task?: string;
  expectedPaths?: string[];
  watchedPaths?: string[];
}): boolean {
  return Boolean(
    params.task?.trim() ||
    (params.expectedPaths?.length ?? 0) > 0 ||
    (params.watchedPaths?.length ?? 0) > 0,
  );
}

export async function syncOmegaExecutionControllerState(params: {
  workspaceRoot: string;
  sessionKey: string;
  skipExecutiveSync?: boolean;
  includeOperationalSummary?: boolean;
  includeWorldSnapshot?: boolean | "urgent_maintenance";
  task?: string;
  expectedPaths?: string[];
  watchedPaths?: string[];
}): Promise<OmegaExecutionControllerState> {
  const [executiveState, operationalSummary] = await Promise.all([
    syncOmegaExecutiveObserverState(
      {
        workspaceRoot: params.workspaceRoot,
        sessionKey: params.sessionKey,
      },
      params.skipExecutiveSync,
    ),
    params.includeOperationalSummary
      ? loadOmegaOperationalMemorySummary({
          workspaceRoot: params.workspaceRoot,
          sessionKey: params.sessionKey,
        }).catch(() => undefined)
      : Promise.resolve(undefined),
  ]);

  const dispatchPlan = executiveState.runtime.dispatchPlan;
  const selectedWorkItem = dispatchPlan.scheduledItems.find(
    (item) => item.id === dispatchPlan.selectedWorkItemId,
  );
  const mustReloadForTaskContext = shouldReloadWorldSnapshotForTaskContext({
    task: params.task,
    expectedPaths: params.expectedPaths,
    watchedPaths: params.watchedPaths,
  });
  const hasUrgentMaintenance = isUrgentMaintenanceWorkItem(selectedWorkItem);
  const shouldLoadWorldSnapshot =
    mustReloadForTaskContext ||
    params.includeWorldSnapshot === true ||
    (params.includeWorldSnapshot === "urgent_maintenance" && hasUrgentMaintenance);
  const worldSnapshot = !shouldLoadWorldSnapshot
    ? undefined
    : !mustReloadForTaskContext && executiveState.sourceWorldSnapshot
      ? executiveState.sourceWorldSnapshot
      : await loadOmegaWorldModelSnapshot({
          workspaceRoot: params.workspaceRoot,
          sessionKey: params.sessionKey,
          task: params.task,
          expectedPaths: params.expectedPaths,
          watchedPaths: params.watchedPaths,
        }).catch(() => undefined);

  return {
    executiveState,
    dispatchPlan,
    selectedWorkItem,
    hasUrgentMaintenance,
    operationalSummary,
    worldSnapshot,
  };
}

export async function resolveOmegaValidatedWorkRouting(params: {
  workspaceRoot: string;
  sessionKey: string;
  task: string;
  expectedPaths: string[];
  watchedPaths?: string[];
  requiresValidation: boolean;
  isolated: boolean;
  runtime?: string;
  interactionKind?: string;
  timeoutSeconds?: number;
  matchedRecoverySuggestedRoute?: "omega_delegate" | "sessions_spawn";
}): Promise<{
  controllerState?: OmegaExecutionControllerState;
  preferredValidatedRoute?: OmegaEmpiricalRoutingPreference;
  executiveRoutingDirective?: OmegaExecutiveRoutingDirective;
  preflight?: OmegaValidatedExecutionPreflight;
  plannedRoute: OmegaWorkPolicyRoute;
}> {
  if (!params.requiresValidation) {
    return {
      plannedRoute: decideOmegaWorkPolicyRoute({
        isolated: params.isolated,
        runtime: params.runtime,
        requiresValidation: false,
        expectedPathCount: params.expectedPaths.length,
        interactionKind: params.interactionKind,
        timeoutSeconds: params.timeoutSeconds,
      }),
    };
  }

  const controllerState = await syncOmegaExecutionControllerState({
    workspaceRoot: params.workspaceRoot,
    sessionKey: params.sessionKey,
    includeWorldSnapshot: true,
    task: params.task,
    expectedPaths: params.expectedPaths,
    watchedPaths: params.watchedPaths,
  }).catch(() => undefined);

  const preferredValidatedRoute = deriveOmegaEmpiricalRoutingPreference({
    snapshot: controllerState?.worldSnapshot,
    requiresValidation: params.requiresValidation,
    expectedPathCount: params.expectedPaths.length,
    watchedPathCount: params.watchedPaths?.length,
  });
  const preflight = await deriveOmegaValidatedExecutionPreflight({
    workspaceRoot: params.workspaceRoot,
    controllerState,
  });
  const executiveRoutingDirective = deriveOmegaExecutiveRoutingDirective({
    dispatchPlan: controllerState?.dispatchPlan,
    requiresValidation: params.requiresValidation,
    expectedPathCount: params.expectedPaths.length,
    matchedRecoverySuggestedRoute: params.matchedRecoverySuggestedRoute,
    preferredValidatedRoute,
  });

  return {
    controllerState,
    preferredValidatedRoute,
    executiveRoutingDirective,
    preflight,
    plannedRoute:
      preflight?.verdict === "isolate"
        ? "sessions_spawn"
        : decideOmegaWorkPolicyRoute({
            isolated: params.isolated,
            runtime: params.runtime,
            requiresValidation: params.requiresValidation,
            expectedPathCount: params.expectedPaths.length,
            interactionKind: params.interactionKind,
            timeoutSeconds: params.timeoutSeconds,
            preferredValidatedRoute,
          }),
  };
}

async function deriveOmegaValidatedExecutionPreflight(params: {
  workspaceRoot: string;
  controllerState?: OmegaExecutionControllerState;
}): Promise<OmegaValidatedExecutionPreflight | undefined> {
  const localityGuard = params.controllerState?.worldSnapshot?.localityExecutionGuard;
  if (localityGuard?.shouldIsolate) {
    return {
      verdict: "isolate",
      reason: "locality_guard",
      confidence: localityGuard.confidence,
    };
  }

  const failureStreak = params.controllerState?.worldSnapshot?.kernel?.tension.failureStreak ?? 0;
  if (failureStreak > 5) {
    return {
      verdict: "isolate",
      reason: "science_law_limit",
      confidence: 0.85,
    };
  }

  return {
    verdict: "allow",
    reason: "none",
    confidence: 0.5,
  };
}

export async function resolveOmegaRecoveryRouteDecision(params: {
  workspaceRoot: string;
  sessionKey: string;
  recovery: OmegaInterruptedGoalRecovery;
}): Promise<OmegaRecoveryRouteDecision> {
  const [recentTurns, metrics] = await Promise.all([
    loadOmegaOperationalMemory({
      workspaceRoot: params.workspaceRoot,
      sessionKey: params.sessionKey,
    }),
    loadOmegaEmpiricalMetrics({ workspaceRoot: params.workspaceRoot }),
  ]);
  const recentStalledTurns = recentTurns
    .slice(-3)
    .filter((entry) => entry.turnHealth === "stalled").length;
  const delegateKey = buildOmegaRecoveryStrategyKey({
    recovery: params.recovery,
    route: "omega_delegate",
  });
  const isolatedKey = buildOmegaRecoveryStrategyKey({
    recovery: params.recovery,
    route: "sessions_spawn",
  });

  const delegateStats = metrics.recovery.strategies[delegateKey] ?? {
    attempts: 0,
    successes: 0,
    failures: 0,
  };
  const isolatedStats = metrics.recovery.strategies[isolatedKey] ?? {
    attempts: 0,
    successes: 0,
    failures: 0,
  };

  return chooseOmegaRecoveryRoute({
    recovery: params.recovery,
    recentStalledTurns,
    delegateStats,
    isolatedStats,
  });
}

export function shouldDispatchOmegaHeartbeatPrompt(params: {
  dispatchPlan: OmegaExecutionControllerState["dispatchPlan"];
  wakeAction: OmegaWakeAction;
  shouldRunAutonomy: boolean;
}): boolean {
  if (params.dispatchPlan.shouldDispatchLlmTurn) {
    return true;
  }
  if (params.wakeAction.kind === "heartbeat_ok" && !params.shouldRunAutonomy) {
    return false;
  }
  return false;
}

export function deriveOmegaHeartbeatCorrectiveControl(params: {
  wakeAction: OmegaWakeAction;
  operationalSummary?: OmegaOperationalMemorySummary;
}): OmegaHeartbeatCorrectiveControl {
  if (
    (params.wakeAction.kind === "review_active_goal" ||
      params.wakeAction.kind === "focus_active_goal_targets") &&
    (params.operationalSummary?.recentStalledTurns ?? 0) >= 2
  ) {
    return {
      kind: "reframe_stalled_goal",
      wakeAction: params.wakeAction as Extract<
        OmegaWakeAction,
        { kind: "review_active_goal" | "focus_active_goal_targets" }
      >,
    };
  }

  switch (params.wakeAction.kind) {
    case "prune_stale_goals":
      return { kind: "prune_stale_goals", wakeAction: params.wakeAction };
    case "prune_superseded_goals":
      return { kind: "prune_superseded_goals", wakeAction: params.wakeAction };
    case "prune_shadowed_goals":
      return { kind: "prune_shadowed_goals", wakeAction: params.wakeAction };
    case "focus_active_goal_targets":
      return { kind: "focus_active_goal_targets", wakeAction: params.wakeAction };
    case "resume_interrupted_goal":
      return { kind: "resume_interrupted_goal", wakeAction: params.wakeAction };
    case "abort_interrupted_goal":
      return { kind: "abort_interrupted_goal", wakeAction: params.wakeAction };
    default:
      return { kind: "none", wakeAction: params.wakeAction };
  }
}

export function shouldStopAfterOmegaExecutiveAction(resultKind: string, status?: string): boolean {
  switch (resultKind) {
    case "pruned_stale_goals":
    case "pruned_superseded_goals":
    case "pruned_shadowed_goals":
    case "focused_active_goal_targets":
    case "aborted_interrupted_goal":
      return true;
    case "resumed_interrupted_goal":
      return status === "ok";
    default:
      return false;
  }
}

export function deriveOmegaExecutiveActionStopReason(params: {
  resultKind: string;
  status?: string;
}): "structured_idle" | undefined {
  return shouldStopAfterOmegaExecutiveAction(params.resultKind, params.status)
    ? "structured_idle"
    : undefined;
}
