import type { OmegaExecutiveDispatchPlan } from "./executive-runtime.js";
import type { OmegaInterruptedGoalRecovery } from "./recovery.js";
import type { OmegaWorldModelSnapshot } from "./world-model.js";

export type OmegaExecutionRoute = "omega_delegate" | "sessions_spawn";
export type OmegaWorkPolicyRoute = OmegaExecutionRoute | "sessions_send";

export type OmegaEmpiricalRoutingPreference = {
  route: OmegaExecutionRoute;
  confidence: number;
  source: "active" | "generalized" | "locality" | "locality_guard";
};

export type OmegaExecutiveRoutingDirective = {
  route: OmegaExecutionRoute;
  reason:
    | "executive_recover_single_target"
    | "executive_recover_multi_target"
    | "executive_recover_isolated_bias"
    | "executive_execute_validated_goal";
  selectedAction: OmegaExecutiveDispatchPlan["selectedAction"];
  queueKind: OmegaExecutiveDispatchPlan["queueKind"];
};

export type OmegaRecoveryRouteDecision = {
  route: OmegaExecutionRoute;
  reason:
    | "suggested_delegate"
    | "suggested_isolation"
    | "stalled_recently"
    | "multi_target_write_repair"
    | "structured_contract_repair"
    | "single_target_local_retry"
    | "empirical_delegate_bias"
    | "empirical_isolation_bias";
};

export const OMEGA_STRONG_ROUTING_CONFIDENCE = 0.7;

export function buildOmegaRecoveryStrategyKey(params: {
  recovery: OmegaInterruptedGoalRecovery;
  route: OmegaExecutionRoute;
}): string {
  const scope =
    params.recovery.remainingTargets.length > 1
      ? "multi_target"
      : params.recovery.remainingTargets.length === 1
        ? "single_target"
        : params.recovery.expectsJson
          ? "structured_only"
          : "general";
  const collateral = params.recovery.collateralPaths.length > 0 ? "collateral" : "contained";
  const errorKind = params.recovery.lastErrorKind ?? "unknown";
  return `${errorKind}|${scope}|${collateral}|${params.route}`;
}

export function deriveOmegaEmpiricalRoutingPreference(params: {
  snapshot?: OmegaWorldModelSnapshot;
  requiresValidation: boolean;
  expectedPathCount: number;
  watchedPathCount?: number;
}): OmegaEmpiricalRoutingPreference | undefined {
  if (!params.requiresValidation || params.expectedPathCount > 1 || !params.snapshot) {
    return undefined;
  }

  const localityGuard = params.snapshot.localityExecutionGuard;
  if (
    localityGuard?.shouldIsolate &&
    localityGuard.confidence >= OMEGA_STRONG_ROUTING_CONFIDENCE &&
    (params.watchedPathCount ?? 0) > params.expectedPathCount
  ) {
    return {
      route: "sessions_spawn",
      confidence: localityGuard.confidence,
      source: "locality_guard",
    };
  }

  const active = params.snapshot.activeRecoveryPreference;
  if (active && active.confidence >= OMEGA_STRONG_ROUTING_CONFIDENCE) {
    return {
      route: active.preferredRoute,
      confidence: active.confidence,
      source: "active",
    };
  }

  const generalized = params.snapshot.generalizedRecoveryPreference;
  if (generalized && generalized.confidence >= OMEGA_STRONG_ROUTING_CONFIDENCE) {
    return {
      route: generalized.preferredRoute,
      confidence: generalized.confidence,
      source: "generalized",
    };
  }

  const locality = params.snapshot.localityRoutingPreference;
  if (locality && locality.confidence >= OMEGA_STRONG_ROUTING_CONFIDENCE) {
    return {
      route: locality.preferredRoute,
      confidence: locality.confidence,
      source: "locality",
    };
  }

  return undefined;
}

export function deriveOmegaExecutiveRoutingDirective(params: {
  dispatchPlan?: OmegaExecutiveDispatchPlan;
  requiresValidation: boolean;
  expectedPathCount: number;
  matchedRecoverySuggestedRoute?: OmegaExecutionRoute;
  preferredValidatedRoute?: OmegaEmpiricalRoutingPreference;
}): OmegaExecutiveRoutingDirective | undefined {
  const plan = params.dispatchPlan;
  if (!params.requiresValidation || !plan || !plan.shouldDispatchLlmTurn) {
    return undefined;
  }

  if (plan.selectedAction === "recover") {
    if (params.expectedPathCount > 1) {
      return {
        route: "sessions_spawn",
        reason: "executive_recover_multi_target",
        selectedAction: plan.selectedAction,
        queueKind: plan.queueKind,
      };
    }
    if (params.preferredValidatedRoute?.route === "sessions_spawn") {
      return {
        route: "sessions_spawn",
        reason: "executive_recover_isolated_bias",
        selectedAction: plan.selectedAction,
        queueKind: plan.queueKind,
      };
    }
    return {
      route: params.matchedRecoverySuggestedRoute ?? "omega_delegate",
      reason: "executive_recover_single_target",
      selectedAction: plan.selectedAction,
      queueKind: plan.queueKind,
    };
  }

  if (
    plan.selectedAction === "direct_execute" &&
    plan.queueKind === "goal" &&
    params.expectedPathCount <= 1
  ) {
    return {
      route: params.preferredValidatedRoute?.route ?? "omega_delegate",
      reason: "executive_execute_validated_goal",
      selectedAction: plan.selectedAction,
      queueKind: plan.queueKind,
    };
  }

  return undefined;
}

export function decideOmegaWorkPolicyRoute(params: {
  isolated: boolean;
  runtime?: string;
  requiresValidation: boolean;
  expectedPathCount: number;
  interactionKind?: string;
  timeoutSeconds?: number;
  preferredValidatedRoute?: OmegaEmpiricalRoutingPreference;
}): OmegaWorkPolicyRoute {
  if (params.isolated || params.runtime === "acp") {
    return "sessions_spawn";
  }
  if (params.expectedPathCount > 1) {
    return "sessions_spawn";
  }
  if (
    params.requiresValidation &&
    params.expectedPathCount <= 1 &&
    params.preferredValidatedRoute &&
    params.preferredValidatedRoute.confidence >= OMEGA_STRONG_ROUTING_CONFIDENCE
  ) {
    return params.preferredValidatedRoute.route;
  }
  if (params.requiresValidation) {
    return "omega_delegate";
  }
  if (
    (params.interactionKind === "verification_request" ||
      params.interactionKind === "analysis_request" ||
      params.interactionKind === "corrective_feedback" ||
      params.interactionKind === "mixed_turn") &&
    typeof params.timeoutSeconds === "number" &&
    params.timeoutSeconds > 0
  ) {
    return "omega_delegate";
  }
  return "sessions_send";
}

export function chooseOmegaRecoveryRoute(params: {
  recovery: OmegaInterruptedGoalRecovery;
  recentStalledTurns: number;
  delegateStats?: { attempts: number; successes: number; failures: number };
  isolatedStats?: { attempts: number; successes: number; failures: number };
}): OmegaRecoveryRouteDecision {
  if (
    params.delegateStats &&
    params.delegateStats.attempts >= 2 &&
    params.delegateStats.successes > params.delegateStats.failures &&
    (!params.isolatedStats || params.delegateStats.successes >= params.isolatedStats.successes)
  ) {
    return { route: "omega_delegate", reason: "empirical_delegate_bias" };
  }
  if (
    params.isolatedStats &&
    params.isolatedStats.attempts >= 2 &&
    params.isolatedStats.successes > params.isolatedStats.failures &&
    (!params.delegateStats || params.isolatedStats.successes > params.delegateStats.successes)
  ) {
    return { route: "sessions_spawn", reason: "empirical_isolation_bias" };
  }
  if (params.recovery.suggestedRoute === "omega_delegate") {
    return params.recentStalledTurns >= 1
      ? { route: "sessions_spawn", reason: "stalled_recently" }
      : { route: "omega_delegate", reason: "suggested_delegate" };
  }

  if (params.recovery.expectsJson && params.recovery.remainingTargets.length === 0) {
    return params.recentStalledTurns >= 1
      ? { route: "sessions_spawn", reason: "structured_contract_repair" }
      : { route: "omega_delegate", reason: "suggested_delegate" };
  }

  if (
    params.recovery.remainingTargets.length === 1 &&
    params.recovery.collateralPaths.length === 0 &&
    params.recentStalledTurns === 0 &&
    params.recovery.failureStreak <= 1
  ) {
    return { route: "omega_delegate", reason: "single_target_local_retry" };
  }

  if (params.recovery.remainingTargets.length > 1) {
    return { route: "sessions_spawn", reason: "multi_target_write_repair" };
  }

  return params.recentStalledTurns >= 1
    ? { route: "sessions_spawn", reason: "stalled_recently" }
    : { route: "sessions_spawn", reason: "suggested_isolation" };
}
