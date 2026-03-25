import type { OmegaKernelGoal, OmegaSelfTimeKernelState } from "./self-time-kernel.js";
import { type OmegaInterruptedGoalRecovery } from "./types.js";

export const OMEGA_AUTONOMOUS_RECOVERY_MAX_FAILURE_STREAK = 1;

const WRITE_FAILURE_ERROR_KINDS = new Set(["target_not_touched", "missing_target_writes"]);

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function deriveUnresolvedTargetsForGoal(
  goal: OmegaKernelGoal | undefined,
  kernel: OmegaSelfTimeKernelState,
): string[] {
  if (!goal || goal.status !== "active" || goal.targets.length === 0) {
    return [];
  }

  return goal.targets.filter((target) => {
    const tracked = kernel.causalGraph.files.find((file) => file.path === target);
    if (!tracked || typeof tracked.lastWriteTurn !== "number") {
      return true;
    }
    if (tracked.lastWriteTurn <= goal.updatedTurn) {
      return true;
    }
    if (
      typeof tracked.lastFailureTurn === "number" &&
      tracked.lastFailureTurn > tracked.lastWriteTurn
    ) {
      return true;
    }
    return false;
  });
}

function buildInterruptedGoalResumeTask(params: {
  goalTask: string;
  remainingTargets: string[];
  requiredKeys: string[];
  suggestedRoute: OmegaInterruptedGoalRecovery["suggestedRoute"];
  lastErrorKind?: string;
}): string {
  const lines = [
    params.goalTask,
    "",
    "[OMEGA recovery]",
    "Resume the interrupted goal from persisted causal state.",
    "Do not restart from scratch or claim success before verification passes.",
  ];

  if (params.lastErrorKind) {
    lines.push(`Last verified failure: ${params.lastErrorKind}.`);
  }
  if (params.remainingTargets.length > 0) {
    lines.push(`Remaining target paths: ${params.remainingTargets.join(", ")}`);
  }
  if (params.requiredKeys.length > 0) {
    lines.push(`Required JSON keys: ${params.requiredKeys.join(", ")}`);
  }
  if (params.suggestedRoute === "sessions_spawn") {
    lines.push("Prefer isolated repair and verify disk writes before claiming success.");
  } else if (params.requiredKeys.length > 0) {
    lines.push("Return exactly one JSON object and no extra prose.");
  }

  return lines.join("\n");
}

export function deriveOmegaInterruptedGoalRecovery(params: {
  kernel?: OmegaSelfTimeKernelState;
}): OmegaInterruptedGoalRecovery | undefined {
  const kernel = params.kernel;
  if (!kernel?.activeGoalId) {
    return undefined;
  }

  const activeGoal = kernel.goals.find((goal) => goal.id === kernel.activeGoalId);
  if (!activeGoal || activeGoal.status !== "active") {
    return undefined;
  }
  if (!kernel.tension.pendingCorrection && kernel.tension.failureStreak <= 0) {
    return undefined;
  }

  const unresolvedTargets = deriveUnresolvedTargetsForGoal(activeGoal, kernel);
  const remainingTargets =
    unresolvedTargets.length > 0 ? unresolvedTargets : [...activeGoal.targets];
  const lastErrorKind = activeGoal.lastErrorKind ?? kernel.world.lastErrorKind;
  const expectsJson =
    activeGoal.requiredKeys.length > 0 || lastErrorKind === "invalid_structured_result";
  const requiredKeys = [...activeGoal.requiredKeys];
  if (remainingTargets.length === 0 && !expectsJson && !lastErrorKind) {
    return undefined;
  }
  const suggestedRoute =
    remainingTargets.length > 0 || WRITE_FAILURE_ERROR_KINDS.has(lastErrorKind ?? "")
      ? "sessions_spawn"
      : "omega_delegate";
  const reason = WRITE_FAILURE_ERROR_KINDS.has(lastErrorKind ?? "")
    ? "verified_write_failure_after_restart"
    : lastErrorKind === "invalid_structured_result"
      ? "verified_structured_failure_after_restart"
      : "pending_active_goal_after_restart";

  return {
    goalId: activeGoal.id,
    goalTask: activeGoal.task,
    remainingTargets,
    expectsJson,
    requiredKeys,
    lastErrorKind,
    failureStreak: kernel.tension.failureStreak,
    reason,
    suggestedRoute,
    resumeTask: buildInterruptedGoalResumeTask({
      goalTask: activeGoal.task,
      remainingTargets,
      requiredKeys,
      suggestedRoute,
      lastErrorKind,
    }),
  };
}

export function taskMatchesOmegaInterruptedGoalRecovery(params: {
  task: string;
  expectedPaths: string[];
  expectedKeys: string[];
  recovery?: OmegaInterruptedGoalRecovery;
}): boolean {
  const recovery = params.recovery;
  if (!recovery) {
    return false;
  }

  const normalizedTask = normalizeText(params.task);
  const normalizedGoalTask = normalizeText(recovery.goalTask);
  const normalizedResumeTask = normalizeText(recovery.resumeTask);

  if (
    normalizedTask === normalizedGoalTask ||
    normalizedTask === normalizedResumeTask ||
    normalizedTask.startsWith(normalizedGoalTask)
  ) {
    return true;
  }

  if (
    params.expectedPaths.length > 0 &&
    params.expectedPaths.every((value) => recovery.remainingTargets.includes(value))
  ) {
    return true;
  }

  if (
    params.expectedKeys.length > 0 &&
    params.expectedKeys.every((value) => recovery.requiredKeys.includes(value))
  ) {
    return true;
  }

  return false;
}
