import {
  deriveOmegaInterruptedGoalRecovery,
  OMEGA_AUTONOMOUS_RECOVERY_MAX_FAILURE_STREAK,
} from "../recovery.js";
import type { OmegaSelfTimeKernelState } from "../self-time-kernel.js";
import {
  deriveFocusedActiveTargets,
  deriveShadowedGoalTasks,
  deriveSupersededGoalTasks,
} from "../session-context.js";

export type OmegaWakeAction =
  | {
      kind: "heartbeat_ok";
      reason: string;
    }
  | {
      kind: "review_active_goal";
      reason: string;
      goalTask: string;
    }
  | {
      kind: "resume_interrupted_goal";
      reason: string;
      goalTask: string;
      goalTargets: string[];
      failureStreak: number;
      suggestedRoute: "omega_delegate" | "sessions_spawn";
      errorKind?: string;
    }
  | {
      kind: "abort_interrupted_goal";
      reason: string;
      goalTask: string;
      goalTargets: string[];
      failureStreak: number;
      suggestedRoute: "omega_delegate" | "sessions_spawn";
      errorKind?: string;
    }
  | {
      kind: "prune_stale_goals";
      reason: string;
      goalTasks: string[];
    }
  | {
      kind: "prune_superseded_goals";
      reason: string;
      goalTasks: string[];
    }
  | {
      kind: "focus_active_goal_targets";
      reason: string;
      goalTask: string;
      goalTargets: string[];
    }
  | {
      kind: "prune_shadowed_goals";
      reason: string;
      goalTasks: string[];
    };

export function decideOmegaWakeAction(params: {
  kernel?: OmegaSelfTimeKernelState;
}): OmegaWakeAction {
  const kernel = params.kernel;
  if (!kernel) {
    return {
      kind: "heartbeat_ok",
      reason: "no_kernel_state",
    };
  }

  const supersededGoalTasks = deriveSupersededGoalTasks(kernel);
  if (supersededGoalTasks.length > 0) {
    return {
      kind: "prune_superseded_goals",
      reason: "superseded_goal_gc_due",
      goalTasks: supersededGoalTasks,
    };
  }

  const shadowedGoalTasks = deriveShadowedGoalTasks(kernel);
  if (shadowedGoalTasks.length > 0) {
    return {
      kind: "prune_shadowed_goals",
      reason: "shadowed_goal_gc_due",
      goalTasks: shadowedGoalTasks,
    };
  }

  const focusedTargets = deriveFocusedActiveTargets(kernel);
  if (focusedTargets.length > 0 && kernel.activeGoalId) {
    const activeGoal = kernel.goals.find((goal) => goal.id === kernel.activeGoalId);
    if (activeGoal) {
      return {
        kind: "focus_active_goal_targets",
        reason: "verified_partial_progress_detected",
        goalTask: activeGoal.task,
        goalTargets: focusedTargets,
      };
    }
  }

  const recovery = deriveOmegaInterruptedGoalRecovery({ kernel });
  if (recovery) {
    if (recovery.failureStreak > OMEGA_AUTONOMOUS_RECOVERY_MAX_FAILURE_STREAK) {
      return {
        kind: "abort_interrupted_goal",
        reason: "failure_streak_too_high",
        goalTask: recovery.goalTask,
        goalTargets: recovery.remainingTargets,
        failureStreak: recovery.failureStreak,
        suggestedRoute: recovery.suggestedRoute,
        errorKind: recovery.lastErrorKind,
      };
    }
    return {
      kind: "resume_interrupted_goal",
      reason: recovery.reason,
      goalTask: recovery.goalTask,
      goalTargets: recovery.remainingTargets,
      failureStreak: recovery.failureStreak,
      suggestedRoute: recovery.suggestedRoute,
      errorKind: recovery.lastErrorKind,
    };
  }

  if (kernel.tension.pendingCorrection && kernel.activeGoalId) {
    const activeGoal = kernel.goals.find((goal) => goal.id === kernel.activeGoalId);
    if (activeGoal) {
      return {
        kind: "review_active_goal",
        reason: "verified_failure_requires_followup",
        goalTask: activeGoal.task,
      };
    }
  }

  const staleGoals = kernel.goals.filter((goal) => goal.status === "stale");
  if (staleGoals.length > 0) {
    return {
      kind: "prune_stale_goals",
      reason: "stale_goal_gc_due",
      goalTasks: staleGoals.map((goal) => goal.task),
    };
  }

  return {
    kind: "heartbeat_ok",
    reason: "no_verified_tension",
  };
}
