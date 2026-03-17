import crypto from "node:crypto";
import {
  interpretOmegaInput,
  type OmegaInputInterpretation,
  type OmegaInteractionKind,
} from "./interaction-model.js";

const OMEGA_KERNEL_REVISION = 2;
const OMEGA_GOAL_LEDGER_LIMIT = 8;
const OMEGA_GOAL_STALE_TURN_GAP = 6;
const OMEGA_CAUSAL_FILE_LIMIT = 24;
const OMEGA_CAUSAL_EDGE_LIMIT = 64;

type KernelValidationSnapshot = {
  expectsJson: boolean;
  expectedKeys: string[];
  expectedPaths: string[];
};

type KernelOutcomeSnapshot = {
  status: "ok" | "error" | "timeout";
  errorKind?: string;
  observedChangedFiles?: string[];
  structuredOk?: boolean;
  writeOk?: boolean;
};

type KernelTimelineEntry = {
  createdAt: number;
  task: string;
  turn?: number;
  validation: KernelValidationSnapshot;
  outcome: KernelOutcomeSnapshot;
  reply?: string;
};

export type OmegaKernelGoalStatus = "active" | "completed" | "stale";

export type OmegaKernelGoal = {
  id: string;
  task: string;
  targets: string[];
  requiredKeys: string[];
  status: OmegaKernelGoalStatus;
  createdAt: number;
  updatedAt: number;
  createdTurn: number;
  updatedTurn: number;
  failureCount: number;
  successCount: number;
  lastOutcomeStatus?: KernelOutcomeSnapshot["status"];
  lastErrorKind?: string;
  lastInteractionKind?: OmegaInteractionKind;
  observedChangedFiles: string[];
};

export type OmegaKernelIdentityState = {
  continuityId: string;
  firstSeenAt: number;
  lastSeenAt: number;
  lastTask?: string;
  lastInteractionKind?: OmegaInteractionKind;
};

export type OmegaKernelWorldState = {
  lastOutcomeStatus?: KernelOutcomeSnapshot["status"];
  lastErrorKind?: string;
  lastObservedChangedFiles: string[];
  lastStructuredOk?: boolean;
  lastWriteOk?: boolean;
};

export type OmegaKernelTensionState = {
  openGoalCount: number;
  staleGoalCount: number;
  failureStreak: number;
  repeatedFailureKinds: string[];
  pendingCorrection: boolean;
};

export type OmegaKernelCausalEdgeRelation =
  | "goal_targets_file"
  | "goal_wrote_file"
  | "goal_failed_on_file";

export type OmegaKernelCausalEdge = {
  goalId: string;
  filePath: string;
  relation: OmegaKernelCausalEdgeRelation;
  updatedAt: number;
  updatedTurn: number;
};

export type OmegaKernelTrackedFile = {
  path: string;
  lastTargetedAt?: number;
  lastTargetedTurn?: number;
  lastTargetGoalId?: string;
  lastWriteAt?: number;
  lastWriteTurn?: number;
  lastWriterGoalId?: string;
  lastFailureAt?: number;
  lastFailureTurn?: number;
  lastFailedGoalId?: string;
  lastFailureKind?: string;
  writeCount: number;
  failureCount: number;
};

export type OmegaKernelCausalGraphState = {
  files: OmegaKernelTrackedFile[];
  edges: OmegaKernelCausalEdge[];
};

export type OmegaSelfTimeKernelState = {
  revision: number;
  sessionKey: string;
  turnCount: number;
  activeGoalId?: string;
  identity: OmegaKernelIdentityState;
  world: OmegaKernelWorldState;
  goals: OmegaKernelGoal[];
  tension: OmegaKernelTensionState;
  causalGraph: OmegaKernelCausalGraphState;
  updatedAt: number;
  timeline?: KernelTimelineEntry[];
};

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeList(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  );
}

function fingerprintGoal(task: string, targets: string[]): string {
  const normalizedTask = normalizeText(task);
  const normalizedTargets = normalizeList(targets).sort().join("|");
  return crypto
    .createHash("sha256")
    .update(`${normalizedTask}::${normalizedTargets}`)
    .digest("hex")
    .slice(0, 16);
}

function buildContinuityId(sessionKey: string): string {
  const normalized = sessionKey.trim() || "main";
  return crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 12);
}

function cloneGoal(goal: OmegaKernelGoal): OmegaKernelGoal {
  return {
    ...goal,
    targets: [...goal.targets],
    requiredKeys: [...goal.requiredKeys],
    observedChangedFiles: [...goal.observedChangedFiles],
  };
}

function cloneTrackedFile(file: OmegaKernelTrackedFile): OmegaKernelTrackedFile {
  return { ...file };
}

function cloneCausalEdge(edge: OmegaKernelCausalEdge): OmegaKernelCausalEdge {
  return { ...edge };
}

function uniqueRepeatedFailureKinds(values: string[]): string[] {
  return Array.from(
    new Set(
      values.filter((value, index, all) => value.length > 0 && all.indexOf(value) !== index),
    ),
  );
}

function sameGoalMatch(goal: OmegaKernelGoal, task: string, targets: string[]): boolean {
  const normalizedTargets = normalizeList(targets);
  if (normalizedTargets.length > 0) {
    return JSON.stringify(goal.targets) === JSON.stringify(normalizedTargets);
  }
  return normalizeText(goal.task) === normalizeText(task);
}

function resolveGoalIndex(params: {
  goals: OmegaKernelGoal[];
  activeGoalId?: string;
  task: string;
  targets: string[];
}): number {
  if (params.activeGoalId) {
    const activeIndex = params.goals.findIndex((goal) => goal.id === params.activeGoalId);
    if (activeIndex >= 0 && sameGoalMatch(params.goals[activeIndex], params.task, params.targets)) {
      return activeIndex;
    }
  }

  return params.goals.findIndex((goal) => sameGoalMatch(goal, params.task, params.targets));
}

function countFailureStreak(outcomes: KernelOutcomeSnapshot[]): number {
  let streak = 0;
  for (let index = outcomes.length - 1; index >= 0; index -= 1) {
    if (outcomes[index]?.status === "ok") {
      break;
    }
    streak += 1;
  }
  return streak;
}

function deriveKernelTension(params: {
  goals: OmegaKernelGoal[];
  timeline: KernelTimelineEntry[];
  currentOutcome: KernelOutcomeSnapshot;
  interaction: OmegaInputInterpretation;
}): OmegaKernelTensionState {
  const recentOutcomes = [...params.timeline.slice(-3).map((entry) => entry.outcome), params.currentOutcome];
  const failureKinds = recentOutcomes
    .filter((outcome) => outcome.status !== "ok")
    .map((outcome) => outcome.errorKind ?? "");
  const openGoals = params.goals.filter((goal) => goal.status === "active");
  const staleGoals = params.goals.filter((goal) => goal.status === "stale");
  const failureStreak = countFailureStreak(recentOutcomes);
  const repeatedFailureKinds = uniqueRepeatedFailureKinds(failureKinds);
  const pendingCorrection =
    openGoals.length > 0 &&
    (failureStreak > 0 ||
      params.interaction.kind === "corrective_feedback" ||
      params.interaction.kind === "mixed_turn");

  return {
    openGoalCount: openGoals.length,
    staleGoalCount: staleGoals.length,
    failureStreak,
    repeatedFailureKinds,
    pendingCorrection,
  };
}

function pruneGoalLedger(goals: OmegaKernelGoal[], activeGoalId?: string): OmegaKernelGoal[] {
  const sorted = [...goals].sort((left, right) => right.updatedTurn - left.updatedTurn);
  const kept: OmegaKernelGoal[] = [];
  for (const goal of sorted) {
    if (kept.length < OMEGA_GOAL_LEDGER_LIMIT || goal.id === activeGoalId) {
      kept.push(goal);
    }
  }
  return kept.sort((left, right) => left.updatedTurn - right.updatedTurn);
}

function cloneCausalGraph(
  graph?: OmegaKernelCausalGraphState,
): OmegaKernelCausalGraphState {
  return {
    files: (graph?.files ?? []).map(cloneTrackedFile),
    edges: (graph?.edges ?? []).map(cloneCausalEdge),
  };
}

function getOrCreateTrackedFile(
  files: OmegaKernelTrackedFile[],
  filePath: string,
): OmegaKernelTrackedFile {
  const existing = files.find((file) => file.path === filePath);
  if (existing) {
    return existing;
  }
  const created: OmegaKernelTrackedFile = {
    path: filePath,
    writeCount: 0,
    failureCount: 0,
  };
  files.push(created);
  return created;
}

function appendCausalEdge(params: {
  edges: OmegaKernelCausalEdge[];
  goalId: string;
  filePath: string;
  relation: OmegaKernelCausalEdgeRelation;
  nowMs: number;
  turnCount: number;
}) {
  const existingIndex = params.edges.findIndex(
    (edge) =>
      edge.goalId === params.goalId &&
      edge.filePath === params.filePath &&
      edge.relation === params.relation,
  );
  if (existingIndex >= 0) {
    params.edges[existingIndex] = {
      ...params.edges[existingIndex],
      updatedAt: params.nowMs,
      updatedTurn: params.turnCount,
    };
    return;
  }
  params.edges.push({
    goalId: params.goalId,
    filePath: params.filePath,
    relation: params.relation,
    updatedAt: params.nowMs,
    updatedTurn: params.turnCount,
  });
}

function pruneCausalGraph(graph: OmegaKernelCausalGraphState): OmegaKernelCausalGraphState {
  const files = [...graph.files]
    .sort((left, right) => {
      const leftScore = Math.max(
        left.lastWriteTurn ?? 0,
        left.lastFailureTurn ?? 0,
        left.lastTargetedTurn ?? 0,
      );
      const rightScore = Math.max(
        right.lastWriteTurn ?? 0,
        right.lastFailureTurn ?? 0,
        right.lastTargetedTurn ?? 0,
      );
      return rightScore - leftScore;
    })
    .slice(0, OMEGA_CAUSAL_FILE_LIMIT);
  const allowedPaths = new Set(files.map((file) => file.path));
  const edges = [...graph.edges]
    .filter((edge) => allowedPaths.has(edge.filePath))
    .sort((left, right) => right.updatedTurn - left.updatedTurn)
    .slice(0, OMEGA_CAUSAL_EDGE_LIMIT)
    .sort((left, right) => left.updatedTurn - right.updatedTurn);
  return {
    files: files.sort((left, right) => left.path.localeCompare(right.path)),
    edges,
  };
}

function updateCausalGraph(params: {
  graph: OmegaKernelCausalGraphState;
  goal: OmegaKernelGoal;
  nowMs: number;
  turnCount: number;
  outcome: KernelOutcomeSnapshot;
}) {
  for (const target of params.goal.targets) {
    const tracked = getOrCreateTrackedFile(params.graph.files, target);
    tracked.lastTargetedAt = params.nowMs;
    tracked.lastTargetedTurn = params.turnCount;
    tracked.lastTargetGoalId = params.goal.id;
    appendCausalEdge({
      edges: params.graph.edges,
      goalId: params.goal.id,
      filePath: target,
      relation: "goal_targets_file",
      nowMs: params.nowMs,
      turnCount: params.turnCount,
    });
  }

  const changedFiles = normalizeList(params.outcome.observedChangedFiles ?? []);
  for (const filePath of changedFiles) {
    const tracked = getOrCreateTrackedFile(params.graph.files, filePath);
    tracked.lastWriteAt = params.nowMs;
    tracked.lastWriteTurn = params.turnCount;
    tracked.lastWriterGoalId = params.goal.id;
    tracked.writeCount += 1;
    appendCausalEdge({
      edges: params.graph.edges,
      goalId: params.goal.id,
      filePath,
      relation: "goal_wrote_file",
      nowMs: params.nowMs,
      turnCount: params.turnCount,
    });
  }

  if (["target_not_touched", "missing_target_writes"].includes(params.outcome.errorKind ?? "")) {
    for (const target of params.goal.targets) {
      const tracked = getOrCreateTrackedFile(params.graph.files, target);
      tracked.lastFailureAt = params.nowMs;
      tracked.lastFailureTurn = params.turnCount;
      tracked.lastFailedGoalId = params.goal.id;
      tracked.lastFailureKind = params.outcome.errorKind;
      tracked.failureCount += 1;
      appendCausalEdge({
        edges: params.graph.edges,
        goalId: params.goal.id,
        filePath: target,
        relation: "goal_failed_on_file",
        nowMs: params.nowMs,
        turnCount: params.turnCount,
      });
    }
  }
}

export function deriveOmegaSelfTimeKernel(params: {
  priorState?: OmegaSelfTimeKernelState;
  sessionKey: string;
  task: string;
  validation: KernelValidationSnapshot;
  outcome: KernelOutcomeSnapshot;
  timeline: KernelTimelineEntry[];
  nowMs?: number;
}): OmegaSelfTimeKernelState {
  const nowMs = params.nowMs ?? Date.now();
  const priorState = params.priorState;
  const interaction = interpretOmegaInput({
    task: params.task,
    validation: params.validation,
    timeline: params.timeline,
  });
  const turnCount = (priorState?.turnCount ?? 0) + 1;
  const goals: OmegaKernelGoal[] = ((priorState?.goals ?? []) as OmegaKernelGoal[]).map(cloneGoal);
  const causalGraph = cloneCausalGraph(priorState?.causalGraph);
  const targets = normalizeList(params.validation.expectedPaths);
  const requiredKeys = normalizeList(params.validation.expectedKeys);
  const actionfulTurn = targets.length > 0 || interaction.hasActionRequest;
  let updatedGoal: OmegaKernelGoal | undefined;

  let activeGoalId = priorState?.activeGoalId;
  if (actionfulTurn) {
    const goalIndex = resolveGoalIndex({
      goals,
      activeGoalId,
      task: params.task,
      targets,
    });

    if (goalIndex >= 0) {
      const goal = goals[goalIndex];
      goal.task = params.task;
      goal.targets = targets.length > 0 ? targets : goal.targets;
      goal.requiredKeys = requiredKeys.length > 0 ? requiredKeys : goal.requiredKeys;
      goal.updatedAt = nowMs;
      goal.updatedTurn = turnCount;
      goal.lastOutcomeStatus = params.outcome.status;
      goal.lastErrorKind = params.outcome.errorKind;
      goal.lastInteractionKind = interaction.kind;
      goal.observedChangedFiles = normalizeList(params.outcome.observedChangedFiles ?? []);
      if (params.outcome.status === "ok") {
        goal.status = "completed";
        goal.successCount += 1;
      } else {
        goal.status = "active";
        goal.failureCount += 1;
      }
      updatedGoal = goal;
      activeGoalId = goal.status === "active" ? goal.id : undefined;
    } else {
      const goalId = fingerprintGoal(params.task, targets);
      const newGoal: OmegaKernelGoal = {
        id: goalId,
        task: params.task,
        targets,
        requiredKeys,
        status: params.outcome.status === "ok" ? "completed" : "active",
        createdAt: nowMs,
        updatedAt: nowMs,
        createdTurn: turnCount,
        updatedTurn: turnCount,
        failureCount: params.outcome.status === "ok" ? 0 : 1,
        successCount: params.outcome.status === "ok" ? 1 : 0,
        lastOutcomeStatus: params.outcome.status,
        lastErrorKind: params.outcome.errorKind,
        lastInteractionKind: interaction.kind,
        observedChangedFiles: normalizeList(params.outcome.observedChangedFiles ?? []),
      };
      goals.push(newGoal);
      updatedGoal = newGoal;
      activeGoalId = newGoal.status === "active" ? newGoal.id : undefined;
    }
  }

  if (updatedGoal) {
    updateCausalGraph({
      graph: causalGraph,
      goal: updatedGoal,
      nowMs,
      turnCount,
      outcome: params.outcome,
    });
  }

  for (const goal of goals) {
    if (
      goal.status === "active" &&
      goal.id !== activeGoalId &&
      turnCount - goal.updatedTurn >= OMEGA_GOAL_STALE_TURN_GAP
    ) {
      goal.status = "stale";
      goal.updatedAt = nowMs;
      goal.updatedTurn = turnCount;
    }
  }

  const activeGoals = goals.filter((goal) => goal.status === "active");
  if (!activeGoalId && activeGoals.length > 0) {
    activeGoalId = activeGoals.sort((left, right) => right.updatedTurn - left.updatedTurn)[0]?.id;
  }

  const prunedGoals = pruneGoalLedger(goals, activeGoalId);
  const prunedActiveGoal = prunedGoals.some((goal) => goal.id === activeGoalId)
    ? activeGoalId
    : prunedGoals
        .filter((goal) => goal.status === "active")
        .sort((left, right) => right.updatedTurn - left.updatedTurn)[0]?.id;

  const tension = deriveKernelTension({
    goals: prunedGoals,
    timeline: params.timeline,
    currentOutcome: params.outcome,
    interaction,
  });
  const prunedCausalGraph = pruneCausalGraph(causalGraph);

  return {
    revision: OMEGA_KERNEL_REVISION,
    sessionKey: params.sessionKey,
    turnCount,
    activeGoalId: prunedActiveGoal,
    identity: {
      continuityId: priorState?.identity.continuityId ?? buildContinuityId(params.sessionKey),
      firstSeenAt: priorState?.identity.firstSeenAt ?? nowMs,
      lastSeenAt: nowMs,
      lastTask: params.task,
      lastInteractionKind: interaction.kind,
    },
    world: {
      lastOutcomeStatus: params.outcome.status,
      lastErrorKind: params.outcome.errorKind,
      lastObservedChangedFiles: normalizeList(params.outcome.observedChangedFiles ?? []),
      lastStructuredOk: params.outcome.structuredOk,
      lastWriteOk: params.outcome.writeOk,
    },
    goals: prunedGoals,
    tension,
    causalGraph: prunedCausalGraph,
    updatedAt: nowMs,
  };
}
