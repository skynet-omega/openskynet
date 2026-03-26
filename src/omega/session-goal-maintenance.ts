import type { OmegaKernelGoal, OmegaSelfTimeKernelState } from "./self-time-kernel.js";
import {
  readOmegaSessionTimeline,
  type OmegaSessionTimelineFile,
  writeOmegaSessionTimelineFile,
} from "./session-context.js";

export async function pruneStaleOmegaGoals(params: {
  workspaceRoot: string;
  sessionKey: string;
}): Promise<{ prunedGoalTasks: string[] }> {
  const existing = await readOmegaSessionTimeline(params);
  if (!existing?.kernel) {
    return { prunedGoalTasks: [] };
  }

  const staleGoals = existing.kernel.goals.filter((goal) => goal.status === "stale");
  if (staleGoals.length === 0) {
    return { prunedGoalTasks: [] };
  }

  const nextKernel: OmegaSelfTimeKernelState = {
    ...existing.kernel,
    goals: existing.kernel.goals.filter((goal) => goal.status !== "stale"),
    tension: {
      ...existing.kernel.tension,
      staleGoalCount: 0,
    },
    updatedAt: Date.now(),
  };
  const hasActiveGoal = nextKernel.goals.some((goal) => goal.status === "active");
  if (!hasActiveGoal) {
    nextKernel.activeGoalId = undefined;
  } else if (
    nextKernel.activeGoalId &&
    !nextKernel.goals.some((goal) => goal.id === nextKernel.activeGoalId)
  ) {
    nextKernel.activeGoalId =
      nextKernel.goals
        .filter((goal) => goal.status === "active")
        .sort((left, right) => right.updatedTurn - left.updatedTurn)[0]?.id ?? undefined;
  }

  const nextState = existing.state
    ? {
        ...existing.state,
        ...(hasActiveGoal
          ? {}
          : {
              activeGoal: undefined,
              activeTargets: [],
            }),
        updatedAt: Date.now(),
      }
    : undefined;

  const payload: OmegaSessionTimelineFile = {
    sessionKey: existing.sessionKey,
    updatedAt: Date.now(),
    entries: existing.entries,
    state: nextState,
    kernel: nextKernel,
    transactions: existing.transactions,
  };
  await writeOmegaSessionTimelineFile({
    workspaceRoot: params.workspaceRoot,
    sessionKey: params.sessionKey,
    payload,
  });

  return {
    prunedGoalTasks: staleGoals.map((goal) => goal.task),
  };
}

function isSupersededGoal(goal: OmegaKernelGoal, kernel: OmegaSelfTimeKernelState): boolean {
  if (goal.status !== "active" || goal.targets.length === 0) {
    return false;
  }
  return goal.targets.every((target) => {
    const tracked = kernel.causalGraph.files.find((file) => file.path === target);
    if (!tracked || typeof tracked.lastWriteTurn !== "number") {
      return false;
    }
    if (tracked.lastWriteTurn <= goal.updatedTurn) {
      return false;
    }
    if (
      typeof tracked.lastFailureTurn === "number" &&
      tracked.lastFailureTurn > tracked.lastWriteTurn
    ) {
      return false;
    }
    return true;
  });
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

export function deriveSupersededGoalTasks(kernel?: OmegaSelfTimeKernelState): string[] {
  if (!kernel) {
    return [];
  }
  return kernel.goals.filter((goal) => isSupersededGoal(goal, kernel)).map((goal) => goal.task);
}

export function deriveFocusedActiveTargets(kernel?: OmegaSelfTimeKernelState): string[] {
  if (!kernel?.activeGoalId) {
    return [];
  }
  const activeGoal = kernel.goals.find((goal) => goal.id === kernel.activeGoalId);
  if (!activeGoal || activeGoal.status !== "active" || activeGoal.targets.length < 2) {
    return [];
  }
  const unresolvedTargets = deriveUnresolvedTargetsForGoal(activeGoal, kernel);
  if (unresolvedTargets.length === 0 || unresolvedTargets.length === activeGoal.targets.length) {
    return [];
  }
  return unresolvedTargets;
}

function sameTargetSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((value, index) => value === b[index]);
}

function isShadowedGoal(goal: OmegaKernelGoal, kernel: OmegaSelfTimeKernelState): boolean {
  if (goal.status !== "active" || goal.targets.length === 0) {
    return false;
  }
  const unresolvedTargets = deriveUnresolvedTargetsForGoal(goal, kernel);
  if (unresolvedTargets.length === 0 || unresolvedTargets.length === goal.targets.length) {
    return false;
  }
  return kernel.goals.some(
    (candidate) =>
      candidate.id !== goal.id &&
      candidate.status === "active" &&
      candidate.updatedTurn > goal.updatedTurn &&
      sameTargetSet(candidate.targets, unresolvedTargets),
  );
}

export function deriveShadowedGoalTasks(kernel?: OmegaSelfTimeKernelState): string[] {
  if (!kernel) {
    return [];
  }
  return kernel.goals.filter((goal) => isShadowedGoal(goal, kernel)).map((goal) => goal.task);
}

export async function pruneSupersededOmegaGoals(params: {
  workspaceRoot: string;
  sessionKey: string;
}): Promise<{ prunedGoalTasks: string[] }> {
  const existing = await readOmegaSessionTimeline(params);
  if (!existing?.kernel) {
    return { prunedGoalTasks: [] };
  }

  const supersededGoals = existing.kernel.goals.filter((goal) =>
    isSupersededGoal(goal, existing.kernel as OmegaSelfTimeKernelState),
  );
  if (supersededGoals.length === 0) {
    return { prunedGoalTasks: [] };
  }

  const remainingGoals = existing.kernel.goals.filter(
    (goal) => !supersededGoals.some((removed) => removed.id === goal.id),
  );
  const activeGoals = remainingGoals.filter((goal) => goal.status === "active");
  const staleGoals = remainingGoals.filter((goal) => goal.status === "stale");
  const currentActiveGoalId = existing.kernel.activeGoalId;
  const nextKernel: OmegaSelfTimeKernelState = {
    ...existing.kernel,
    goals: remainingGoals,
    activeGoalId:
      currentActiveGoalId && remainingGoals.some((goal) => goal.id === currentActiveGoalId)
        ? currentActiveGoalId
        : activeGoals.sort((left, right) => right.updatedTurn - left.updatedTurn)[0]?.id,
    tension: {
      ...existing.kernel.tension,
      openGoalCount: activeGoals.length,
      staleGoalCount: staleGoals.length,
      pendingCorrection: activeGoals.length > 0 && existing.kernel.tension.failureStreak > 0,
    },
    updatedAt: Date.now(),
  };

  const nextState = existing.state
    ? {
        ...existing.state,
        ...(nextKernel.activeGoalId
          ? {}
          : {
              activeGoal: undefined,
              activeTargets: [],
            }),
        updatedAt: Date.now(),
      }
    : undefined;

  const payload: OmegaSessionTimelineFile = {
    sessionKey: existing.sessionKey,
    updatedAt: Date.now(),
    entries: existing.entries,
    state: nextState,
    kernel: nextKernel,
    transactions: existing.transactions,
  };
  await writeOmegaSessionTimelineFile({
    workspaceRoot: params.workspaceRoot,
    sessionKey: params.sessionKey,
    payload,
  });

  return {
    prunedGoalTasks: supersededGoals.map((goal) => goal.task),
  };
}

export async function focusActiveOmegaGoalTargets(params: {
  workspaceRoot: string;
  sessionKey: string;
  learnedConstraints?: string[];
}): Promise<{ focusedGoalTask?: string; focusedTargets: string[] }> {
  const existing = await readOmegaSessionTimeline(params);
  const existingKernel = existing?.kernel;
  const existingState = existing?.state;
  if (!existingKernel || !existingState) {
    return { focusedTargets: [] };
  }
  const focusedTargets = deriveFocusedActiveTargets(existingKernel);
  if (focusedTargets.length === 0) {
    return { focusedTargets: [] };
  }

  const activeGoal = existingKernel.goals.find((goal) => goal.id === existingKernel.activeGoalId);
  const learnedConstraints = Array.from(
    new Set([
      ...(existingState.learnedConstraints ?? []),
      ...((params.learnedConstraints ?? []).map((value) => value.trim()).filter(Boolean) ?? []),
    ]),
  ).slice(-6);
  const nextState = {
    ...existingState,
    activeTargets: focusedTargets,
    learnedConstraints,
    updatedAt: Date.now(),
  };

  const payload: OmegaSessionTimelineFile = {
    sessionKey: existing.sessionKey,
    updatedAt: Date.now(),
    entries: existing.entries,
    state: nextState,
    kernel: existingKernel,
    transactions: existing.transactions,
  };
  await writeOmegaSessionTimelineFile({
    workspaceRoot: params.workspaceRoot,
    sessionKey: params.sessionKey,
    payload,
  });

  return {
    focusedGoalTask: activeGoal?.task,
    focusedTargets,
  };
}

export async function pruneShadowedOmegaGoals(params: {
  workspaceRoot: string;
  sessionKey: string;
}): Promise<{ prunedGoalTasks: string[] }> {
  const existing = await readOmegaSessionTimeline(params);
  if (!existing?.kernel) {
    return { prunedGoalTasks: [] };
  }
  const shadowedGoals = existing.kernel.goals.filter((goal) =>
    isShadowedGoal(goal, existing.kernel as OmegaSelfTimeKernelState),
  );
  if (shadowedGoals.length === 0) {
    return { prunedGoalTasks: [] };
  }

  const remainingGoals = existing.kernel.goals.filter(
    (goal) => !shadowedGoals.some((removed) => removed.id === goal.id),
  );
  const activeGoals = remainingGoals.filter((goal) => goal.status === "active");
  const staleGoals = remainingGoals.filter((goal) => goal.status === "stale");
  const currentActiveGoalId = existing.kernel.activeGoalId;
  const nextKernel: OmegaSelfTimeKernelState = {
    ...existing.kernel,
    goals: remainingGoals,
    activeGoalId:
      currentActiveGoalId && remainingGoals.some((goal) => goal.id === currentActiveGoalId)
        ? currentActiveGoalId
        : activeGoals.sort((left, right) => right.updatedTurn - left.updatedTurn)[0]?.id,
    tension: {
      ...existing.kernel.tension,
      openGoalCount: activeGoals.length,
      staleGoalCount: staleGoals.length,
      pendingCorrection: activeGoals.length > 0 && existing.kernel.tension.failureStreak > 0,
    },
    updatedAt: Date.now(),
  };

  const activeGoal = nextKernel.activeGoalId
    ? nextKernel.goals.find((goal) => goal.id === nextKernel.activeGoalId)
    : undefined;
  const nextState = existing.state
    ? {
        ...existing.state,
        activeGoal: activeGoal?.task,
        activeTargets: activeGoal?.targets ?? [],
        updatedAt: Date.now(),
      }
    : undefined;

  const payload: OmegaSessionTimelineFile = {
    sessionKey: existing.sessionKey,
    updatedAt: Date.now(),
    entries: existing.entries,
    state: nextState,
    kernel: nextKernel,
    transactions: existing.transactions,
  };
  await writeOmegaSessionTimelineFile({
    workspaceRoot: params.workspaceRoot,
    sessionKey: params.sessionKey,
    payload,
  });

  return {
    prunedGoalTasks: shadowedGoals.map((goal) => goal.task),
  };
}
