import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { recordOmegaValidationMetrics } from "./empirical-metrics.js";
import {
  formatOmegaRecoveryEpisodeRecall,
  loadOmegaRecoveryEpisodeRecall,
  syncOmegaEpisodeMemoryDigest,
} from "./episodic-recall.js";
import { deriveOmegaSessionSelfState, type OmegaSessionSelfState } from "./event-model.js";
import {
  cloneOmegaTaskTransactions,
  parseOmegaTaskTransactions,
  selectActiveOmegaTaskTransaction,
  updateOmegaTaskTransactions,
  type OmegaTaskTransaction,
  type OmegaTaskTransactionExecutionSnapshot,
} from "./task-transaction.js";
import {
  deriveOmegaSelfTimeKernel,
  type OmegaKernelCausalEdge,
  type OmegaKernelCausalGraphState,
  type OmegaKernelGoal,
  type OmegaKernelTrackedFile,
  type OmegaSelfTimeKernelState,
} from "./self-time-kernel.js";
import type { OmegaSessionTaskValidationSummary } from "./session-task.js";

const OMEGA_SESSION_HISTORY_LIMIT = 32;
const OMEGA_PROMPT_HISTORY_LIMIT = 3;

export type OmegaSessionValidationSnapshot = {
  expectsJson: boolean;
  expectedKeys: string[];
  expectedPaths: string[];
};

export type OmegaSessionOutcomeSnapshot = {
  status: "ok" | "error" | "timeout";
  errorKind?: string;
  observedChangedFiles?: string[];
  structuredOk?: boolean;
  writeOk?: boolean;
};

export type OmegaSessionTimelineEntry = {
  createdAt: number;
  task: string;
  validation: OmegaSessionValidationSnapshot;
  outcome: OmegaSessionOutcomeSnapshot;
  causalTargets?: string[];
  reply?: string;
};

type OmegaSessionTimelineFile = {
  sessionKey: string;
  updatedAt: number;
  entries: OmegaSessionTimelineEntry[];
  state?: OmegaSessionSelfState;
  kernel?: OmegaSelfTimeKernelState;
  transactions?: OmegaTaskTransaction[];
};

function parseTrackedFile(value: unknown): OmegaKernelTrackedFile | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const file = value as Partial<OmegaKernelTrackedFile>;
  if (typeof file.path !== "string" || file.path.trim().length === 0) {
    return undefined;
  }
  return {
    path: file.path,
    lastTargetedAt: typeof file.lastTargetedAt === "number" ? file.lastTargetedAt : undefined,
    lastTargetedTurn:
      typeof file.lastTargetedTurn === "number" ? file.lastTargetedTurn : undefined,
    lastTargetGoalId:
      typeof file.lastTargetGoalId === "string" ? file.lastTargetGoalId : undefined,
    lastWriteAt: typeof file.lastWriteAt === "number" ? file.lastWriteAt : undefined,
    lastWriteTurn: typeof file.lastWriteTurn === "number" ? file.lastWriteTurn : undefined,
    lastWriterGoalId:
      typeof file.lastWriterGoalId === "string" ? file.lastWriterGoalId : undefined,
    lastFailureAt: typeof file.lastFailureAt === "number" ? file.lastFailureAt : undefined,
    lastFailureTurn:
      typeof file.lastFailureTurn === "number" ? file.lastFailureTurn : undefined,
    lastFailedGoalId:
      typeof file.lastFailedGoalId === "string" ? file.lastFailedGoalId : undefined,
    lastFailureKind:
      typeof file.lastFailureKind === "string" ? file.lastFailureKind : undefined,
    writeCount: typeof file.writeCount === "number" ? file.writeCount : 0,
    failureCount: typeof file.failureCount === "number" ? file.failureCount : 0,
  };
}

function parseCausalEdge(value: unknown): OmegaKernelCausalEdge | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const edge = value as Partial<OmegaKernelCausalEdge>;
  if (
    typeof edge.goalId !== "string" ||
    typeof edge.filePath !== "string" ||
    typeof edge.updatedAt !== "number" ||
    typeof edge.updatedTurn !== "number"
  ) {
    return undefined;
  }
  if (
    edge.relation !== "goal_targets_file" &&
    edge.relation !== "goal_wrote_file" &&
    edge.relation !== "goal_failed_on_file"
  ) {
    return undefined;
  }
  return {
    goalId: edge.goalId,
    filePath: edge.filePath,
    relation: edge.relation,
    updatedAt: edge.updatedAt,
    updatedTurn: edge.updatedTurn,
  };
}

function parseCausalGraph(value: unknown): OmegaKernelCausalGraphState {
  if (!value || typeof value !== "object") {
    return {
      files: [],
      edges: [],
    };
  }
  const graph = value as Partial<OmegaKernelCausalGraphState>;
  return {
    files: Array.isArray(graph.files)
      ? graph.files
          .map(parseTrackedFile)
          .filter((value): value is OmegaKernelTrackedFile => value !== undefined)
      : [],
    edges: Array.isArray(graph.edges)
      ? graph.edges
          .map(parseCausalEdge)
          .filter((value): value is OmegaKernelCausalEdge => value !== undefined)
      : [],
  };
}

function sanitizeSessionKey(sessionKey: string): string {
  const normalized = canonicalizeOmegaSessionKey(sessionKey);
  const readable = normalized.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 48) || "main";
  const digest = crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 12);
  return `${readable}-${digest}.json`;
}

function canonicalizeOmegaSessionKey(sessionKey: string): string {
  const normalized = sessionKey.trim() || "main";
  if (normalized === "main" || normalized.toLowerCase() === "agent:main:main") {
    return "agent:main:main";
  }
  return normalized;
}

function resolveOmegaSessionStateReadCandidates(params: {
  workspaceRoot: string;
  sessionKey: string;
}): string[] {
  const canonicalFile = resolveOmegaSessionStateFile(params);
  const normalized = params.sessionKey.trim() || "main";
  if (normalized === "main" || normalized.toLowerCase() === "agent:main:main") {
    const legacyFile = path.join(resolveOmegaSessionStateDir(params.workspaceRoot), sanitizeSessionKey("main"));
    return canonicalFile === legacyFile ? [canonicalFile] : [canonicalFile, legacyFile];
  }
  return [canonicalFile];
}

function resolveOmegaSessionStateDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".openskynet", "omega-session-state");
}

export function resolveOmegaSessionStateFile(params: {
  workspaceRoot: string;
  sessionKey: string;
}): string {
  return path.join(resolveOmegaSessionStateDir(params.workspaceRoot), sanitizeSessionKey(params.sessionKey));
}

async function readOmegaSessionTimeline(params: {
  workspaceRoot: string;
  sessionKey: string;
}): Promise<OmegaSessionTimelineFile | null> {
  const canonicalSessionKey = canonicalizeOmegaSessionKey(params.sessionKey);
  for (const stateFile of resolveOmegaSessionStateReadCandidates(params)) {
    try {
      const raw = await fs.readFile(stateFile, "utf-8");
      const parsed = JSON.parse(raw) as Partial<OmegaSessionTimelineFile>;
      if (!parsed || !Array.isArray(parsed.entries)) {
        return null;
      }
      const parsedKernel =
        parsed.kernel && typeof parsed.kernel === "object"
          ? {
            revision:
              typeof parsed.kernel.revision === "number" ? parsed.kernel.revision : 1,
            sessionKey:
              typeof parsed.kernel.sessionKey === "string"
                ? canonicalizeOmegaSessionKey(parsed.kernel.sessionKey)
                : canonicalSessionKey,
            turnCount:
              typeof parsed.kernel.turnCount === "number" ? parsed.kernel.turnCount : 0,
            activeGoalId:
              typeof parsed.kernel.activeGoalId === "string" ? parsed.kernel.activeGoalId : undefined,
            identity:
              parsed.kernel.identity && typeof parsed.kernel.identity === "object"
                ? {
                    continuityId:
                      typeof parsed.kernel.identity.continuityId === "string"
                        ? parsed.kernel.identity.continuityId
                        : "",
                    firstSeenAt:
                      typeof parsed.kernel.identity.firstSeenAt === "number"
                        ? parsed.kernel.identity.firstSeenAt
                        : 0,
                    lastSeenAt:
                      typeof parsed.kernel.identity.lastSeenAt === "number"
                        ? parsed.kernel.identity.lastSeenAt
                        : 0,
                    lastTask:
                      typeof parsed.kernel.identity.lastTask === "string"
                        ? parsed.kernel.identity.lastTask
                        : undefined,
                    lastInteractionKind:
                      typeof parsed.kernel.identity.lastInteractionKind === "string"
                        ? parsed.kernel.identity.lastInteractionKind
                        : undefined,
                  }
                : {
                    continuityId: "",
                    firstSeenAt: 0,
                    lastSeenAt: 0,
                  },
            world:
              parsed.kernel.world && typeof parsed.kernel.world === "object"
                ? {
                    lastOutcomeStatus:
                      typeof parsed.kernel.world.lastOutcomeStatus === "string"
                        ? parsed.kernel.world.lastOutcomeStatus
                        : undefined,
                    lastErrorKind:
                      typeof parsed.kernel.world.lastErrorKind === "string"
                        ? parsed.kernel.world.lastErrorKind
                        : undefined,
                    lastObservedChangedFiles: Array.isArray(parsed.kernel.world.lastObservedChangedFiles)
                      ? parsed.kernel.world.lastObservedChangedFiles.filter(
                          (value): value is string =>
                            typeof value === "string" && value.trim().length > 0,
                        )
                      : [],
                    lastStructuredOk:
                      typeof parsed.kernel.world.lastStructuredOk === "boolean"
                        ? parsed.kernel.world.lastStructuredOk
                        : undefined,
                    lastWriteOk:
                      typeof parsed.kernel.world.lastWriteOk === "boolean"
                        ? parsed.kernel.world.lastWriteOk
                        : undefined,
                  }
                : {
                    lastObservedChangedFiles: [],
                  },
            goals: Array.isArray(parsed.kernel.goals)
              ? parsed.kernel.goals.filter(
                  (goal): goal is OmegaKernelGoal =>
                    !!goal &&
                    typeof goal === "object" &&
                    typeof goal.id === "string" &&
                    typeof goal.task === "string",
                ).map((goal) => ({
                  id: goal.id,
                  task: goal.task,
                  targets: Array.isArray(goal.targets)
                    ? goal.targets.filter(
                        (value): value is string => typeof value === "string" && value.trim().length > 0,
                      )
                    : [],
                  requiredKeys: Array.isArray(goal.requiredKeys)
                    ? goal.requiredKeys.filter(
                        (value): value is string => typeof value === "string" && value.trim().length > 0,
                      )
                    : [],
                  status:
                    goal.status === "active" || goal.status === "completed" || goal.status === "stale"
                      ? goal.status
                      : "stale",
                  createdAt: typeof goal.createdAt === "number" ? goal.createdAt : 0,
                  updatedAt: typeof goal.updatedAt === "number" ? goal.updatedAt : 0,
                  createdTurn: typeof goal.createdTurn === "number" ? goal.createdTurn : 0,
                  updatedTurn: typeof goal.updatedTurn === "number" ? goal.updatedTurn : 0,
                  failureCount: typeof goal.failureCount === "number" ? goal.failureCount : 0,
                  successCount: typeof goal.successCount === "number" ? goal.successCount : 0,
                  lastOutcomeStatus:
                    typeof goal.lastOutcomeStatus === "string" ? goal.lastOutcomeStatus : undefined,
                  lastErrorKind:
                    typeof goal.lastErrorKind === "string" ? goal.lastErrorKind : undefined,
                  lastInteractionKind:
                    typeof goal.lastInteractionKind === "string" ? goal.lastInteractionKind : undefined,
                  observedChangedFiles: Array.isArray(goal.observedChangedFiles)
                    ? goal.observedChangedFiles.filter(
                        (value): value is string => typeof value === "string" && value.trim().length > 0,
                      )
                    : [],
                }))
              : [],
            tension:
              parsed.kernel.tension && typeof parsed.kernel.tension === "object"
                ? {
                    openGoalCount:
                      typeof parsed.kernel.tension.openGoalCount === "number"
                        ? parsed.kernel.tension.openGoalCount
                        : 0,
                    staleGoalCount:
                      typeof parsed.kernel.tension.staleGoalCount === "number"
                        ? parsed.kernel.tension.staleGoalCount
                        : 0,
                    failureStreak:
                      typeof parsed.kernel.tension.failureStreak === "number"
                        ? parsed.kernel.tension.failureStreak
                        : 0,
                    repeatedFailureKinds: Array.isArray(parsed.kernel.tension.repeatedFailureKinds)
                      ? parsed.kernel.tension.repeatedFailureKinds.filter(
                          (value): value is string => typeof value === "string" && value.trim().length > 0,
                        )
                      : [],
                    pendingCorrection:
                      parsed.kernel.tension.pendingCorrection === true,
                  }
                : {
                    openGoalCount: 0,
                    staleGoalCount: 0,
                    failureStreak: 0,
                    repeatedFailureKinds: [],
                    pendingCorrection: false,
                  },
            causalGraph: parseCausalGraph(parsed.kernel.causalGraph),
            updatedAt:
              typeof parsed.kernel.updatedAt === "number" ? parsed.kernel.updatedAt : 0,
            }
          : undefined;

      return {
        sessionKey:
          typeof parsed.sessionKey === "string"
            ? canonicalizeOmegaSessionKey(parsed.sessionKey)
            : canonicalSessionKey,
        updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
        entries: parsed.entries.filter(
          (entry): entry is OmegaSessionTimelineEntry =>
            !!entry &&
            typeof entry === "object" &&
            typeof entry.createdAt === "number" &&
            typeof entry.task === "string" &&
            !!entry.validation &&
            !!entry.outcome,
        ).map((entry) => {
          const causalTargets = (entry as { causalTargets?: unknown[] }).causalTargets;
          return {
            ...entry,
            causalTargets: Array.isArray(causalTargets)
              ? causalTargets.filter(
                  (value): value is string => typeof value === "string" && value.trim().length > 0,
                )
              : undefined,
            ...(typeof (entry as { reply?: unknown }).reply === "string"
              ? { reply: (entry as { reply?: string }).reply }
              : {}),
          };
        }),
        state:
          parsed.state && typeof parsed.state === "object"
            ? {
              activeGoal:
                typeof parsed.state.activeGoal === "string" ? parsed.state.activeGoal : undefined,
              activeTargets: Array.isArray(parsed.state.activeTargets)
                ? parsed.state.activeTargets.filter(
                    (value): value is string => typeof value === "string" && value.trim().length > 0,
                  )
                : [],
              requiredKeys: Array.isArray(parsed.state.requiredKeys)
                ? parsed.state.requiredKeys.filter(
                    (value): value is string => typeof value === "string" && value.trim().length > 0,
                  )
                : [],
              lastInteractionKind:
                typeof parsed.state.lastInteractionKind === "string"
                  ? parsed.state.lastInteractionKind
                  : undefined,
              lastTask: typeof parsed.state.lastTask === "string" ? parsed.state.lastTask : undefined,
              lastOutcomeStatus:
                typeof parsed.state.lastOutcomeStatus === "string"
                  ? parsed.state.lastOutcomeStatus
                  : undefined,
              lastErrorKind:
                typeof parsed.state.lastErrorKind === "string" ? parsed.state.lastErrorKind : undefined,
              lastSuccessfulTask:
                typeof parsed.state.lastSuccessfulTask === "string"
                  ? parsed.state.lastSuccessfulTask
                  : undefined,
              lastFailedTask:
                typeof parsed.state.lastFailedTask === "string"
                  ? parsed.state.lastFailedTask
                  : undefined,
              learnedConstraints: Array.isArray(parsed.state.learnedConstraints)
                ? parsed.state.learnedConstraints.filter(
                    (value): value is string => typeof value === "string" && value.trim().length > 0,
                  )
                : [],
              updatedAt:
                typeof parsed.state.updatedAt === "number" ? parsed.state.updatedAt : 0,
              }
            : undefined,
        kernel: parsedKernel,
        transactions: parseOmegaTaskTransactions(parsed.transactions),
      };
    } catch {
      continue;
    }
  }
  return null;
}

export async function loadOmegaSessionTimeline(params: {
  workspaceRoot: string;
  sessionKey: string;
}): Promise<OmegaSessionTimelineEntry[]> {
  const timeline = await readOmegaSessionTimeline(params);
  return timeline?.entries ?? [];
}

export async function loadOmegaSessionSelfState(params: {
  workspaceRoot: string;
  sessionKey: string;
}): Promise<OmegaSessionSelfState | undefined> {
  const timeline = await readOmegaSessionTimeline(params);
  return timeline?.state;
}

export async function loadOmegaSelfTimeKernel(params: {
  workspaceRoot: string;
  sessionKey: string;
}): Promise<OmegaSelfTimeKernelState | undefined> {
  const timeline = await readOmegaSessionTimeline(params);
  return timeline?.kernel;
}

export async function loadOmegaTaskTransactions(params: {
  workspaceRoot: string;
  sessionKey: string;
}): Promise<OmegaTaskTransaction[]> {
  const timeline = await readOmegaSessionTimeline(params);
  return cloneOmegaTaskTransactions(timeline?.transactions ?? []);
}

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
  await fs.writeFile(
    resolveOmegaSessionStateFile({
      workspaceRoot: params.workspaceRoot,
      sessionKey: params.sessionKey,
    }),
    JSON.stringify(payload, null, 2),
    "utf-8",
  );

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
  if (
    unresolvedTargets.length === 0 ||
    unresolvedTargets.length === activeGoal.targets.length
  ) {
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
  if (
    unresolvedTargets.length === 0 ||
    unresolvedTargets.length === goal.targets.length
  ) {
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
      currentActiveGoalId &&
      remainingGoals.some((goal) => goal.id === currentActiveGoalId)
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
  await fs.writeFile(
    resolveOmegaSessionStateFile({
      workspaceRoot: params.workspaceRoot,
      sessionKey: params.sessionKey,
    }),
    JSON.stringify(payload, null, 2),
    "utf-8",
  );

  return {
    prunedGoalTasks: supersededGoals.map((goal) => goal.task),
  };
}

export async function focusActiveOmegaGoalTargets(params: {
  workspaceRoot: string;
  sessionKey: string;
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
  const nextState = {
    ...existingState,
    activeTargets: focusedTargets,
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
  await fs.writeFile(
    resolveOmegaSessionStateFile({
      workspaceRoot: params.workspaceRoot,
      sessionKey: params.sessionKey,
    }),
    JSON.stringify(payload, null, 2),
    "utf-8",
  );

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
      currentActiveGoalId &&
      remainingGoals.some((goal) => goal.id === currentActiveGoalId)
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
  await fs.writeFile(
    resolveOmegaSessionStateFile({
      workspaceRoot: params.workspaceRoot,
      sessionKey: params.sessionKey,
    }),
    JSON.stringify(payload, null, 2),
    "utf-8",
  );

  return {
    prunedGoalTasks: shadowedGoals.map((goal) => goal.task),
  };
}

function describeOmegaRole(validation: OmegaSessionValidationSnapshot): string {
  if (validation.expectedPaths.length > 1) {
    return "multi_target_editor";
  }
  if (validation.expectedPaths.length === 1) {
    return "local_editor";
  }
  if (validation.expectsJson || validation.expectedKeys.length > 0) {
    return "structured_analyst";
  }
  return "session_delegate";
}

function formatTimelineEntry(entry: OmegaSessionTimelineEntry): string {
  const parts = [`status=${entry.outcome.status}`];
  if (entry.outcome.errorKind) {
    parts.push(`error=${entry.outcome.errorKind}`);
  }
  if (entry.validation.expectedPaths.length > 0) {
    parts.push(`targets=${entry.validation.expectedPaths.join(", ")}`);
  }
  if (entry.validation.expectedKeys.length > 0) {
    parts.push(`keys=${entry.validation.expectedKeys.join(", ")}`);
  }
  if (entry.outcome.observedChangedFiles && entry.outcome.observedChangedFiles.length > 0) {
    parts.push(`changed=${entry.outcome.observedChangedFiles.join(", ")}`);
  }
  if (entry.causalTargets && entry.causalTargets.length > 0) {
    parts.push(`causal=${entry.causalTargets.join(", ")}`);
  }
  return `${entry.task} | ${parts.join(" | ")}`;
}

function deriveTimelineCausalTargets(params: {
  validation: OmegaSessionValidationSnapshot;
  priorState?: OmegaSessionSelfState;
  priorKernel?: OmegaSelfTimeKernelState;
}): string[] {
  if (params.validation.expectedPaths.length > 0) {
    return [...params.validation.expectedPaths];
  }
  if (params.priorState?.activeTargets && params.priorState.activeTargets.length > 0) {
    return [...params.priorState.activeTargets];
  }
  if (params.priorKernel?.activeGoalId) {
    const activeGoal = params.priorKernel.goals.find(
      (goal) => goal.id === params.priorKernel?.activeGoalId,
    );
    if (activeGoal?.targets.length) {
      return [...activeGoal.targets];
    }
  }
  return [];
}

export async function buildOmegaSessionContextPrompt(params: {
  workspaceRoot: string;
  sessionKey: string;
  task: string;
  validation: OmegaSessionValidationSnapshot;
}): Promise<string | undefined> {
  const sessionState = await readOmegaSessionTimeline({
    workspaceRoot: params.workspaceRoot,
    sessionKey: params.sessionKey,
  });
  const timeline = sessionState?.entries ?? [];
  const state = sessionState?.state;
  const hasValidation =
    params.validation.expectsJson ||
    params.validation.expectedKeys.length > 0 ||
    params.validation.expectedPaths.length > 0;

  if (!hasValidation && timeline.length === 0 && !state) {
    return undefined;
  }

  const lines: string[] = [
    "[OMEGA Session Self]",
    `Session: ${params.sessionKey}`,
    `Role: ${describeOmegaRole(params.validation)}`,
    "Treat the incoming message as one turn inside a persistent runtime, not as a blank world state.",
    "Separate instruction, observation, and verified prior work. Do not invent continuity that is not in the persisted session state.",
  ];

  if (state?.activeGoal) {
    lines.push(`Persistent goal: ${state.activeGoal}`);
  }
  if (state?.activeTargets && state.activeTargets.length > 0) {
    lines.push(`Persistent targets: ${state.activeTargets.join(", ")}`);
  }
  if (state?.lastInteractionKind) {
    lines.push(`Previous interaction kind: ${state.lastInteractionKind}`);
  }
  if (state?.lastOutcomeStatus) {
    const outcomeBits = [`Last verified outcome: ${state.lastOutcomeStatus}`];
    if (state.lastErrorKind) {
      outcomeBits.push(`error=${state.lastErrorKind}`);
    }
    lines.push(outcomeBits.join(" | "));
  }
  if (state?.learnedConstraints && state.learnedConstraints.length > 0) {
    lines.push(`Learned constraints: ${state.learnedConstraints.join(", ")}`);
  }
  const activeTransaction = selectActiveOmegaTaskTransaction(sessionState?.transactions ?? []);
  if (activeTransaction) {
    lines.push("");
    lines.push("[OMEGA Task Transaction]");
    lines.push(`Transaction status: ${activeTransaction.status}`);
    lines.push(`Transaction attempts: ${activeTransaction.attempts.length}`);
    const lastAttempt = activeTransaction.attempts.at(-1);
    if (lastAttempt?.route) {
      lines.push(`Last transaction route: ${lastAttempt.route}`);
    }
    if (activeTransaction.nextRecoveryStep.kind !== "none") {
      lines.push(
        `Next recovery step: ${activeTransaction.nextRecoveryStep.kind} (${activeTransaction.nextRecoveryStep.reason})`,
      );
      if (activeTransaction.nextRecoveryStep.route) {
        lines.push(`Next recovery route: ${activeTransaction.nextRecoveryStep.route}`);
      }
      if (activeTransaction.nextRecoveryStep.remainingTargets.length > 0) {
        lines.push(
          `Transaction remaining targets: ${activeTransaction.nextRecoveryStep.remainingTargets.join(", ")}`,
        );
      }
    }
  }
  const episodicRecall = await loadOmegaRecoveryEpisodeRecall({
    workspaceRoot: params.workspaceRoot,
    sessionKey: params.sessionKey,
    task: params.task,
    validation: params.validation,
    errorKind: activeTransaction?.verifiedOutcome.errorKind ?? state?.lastErrorKind,
    maxResults: 2,
  });
  if (episodicRecall.length > 0) {
    lines.push("");
    lines.push(...formatOmegaRecoveryEpisodeRecall(episodicRecall));
  }
  const kernel = sessionState?.kernel;
  if (kernel) {
    lines.push("");
    lines.push("[OMEGA Self/Time Kernel]");
    lines.push(`Continuity turns: ${kernel.turnCount}`);
    if (kernel.activeGoalId) {
      const activeGoal = kernel.goals.find((goal) => goal.id === kernel.activeGoalId);
      if (activeGoal) {
        lines.push(`Kernel active goal: ${activeGoal.task}`);
        if (activeGoal.targets.length > 0) {
          lines.push(`Kernel active targets: ${activeGoal.targets.join(", ")}`);
        }
      }
    }
    lines.push(`Kernel failure streak: ${kernel.tension.failureStreak}`);
    lines.push(`Kernel open goals: ${kernel.tension.openGoalCount}`);
    if (kernel.tension.repeatedFailureKinds.length > 0) {
      lines.push(
        `Kernel repeated failures: ${kernel.tension.repeatedFailureKinds.join(", ")}`,
      );
    }
  }

  if (params.validation.expectedPaths.length > 0) {
    lines.push(`Active targets this turn: ${params.validation.expectedPaths.join(", ")}`);
  }
  if (params.validation.expectedKeys.length > 0) {
    lines.push(`Required structured keys this turn: ${params.validation.expectedKeys.join(", ")}`);
  }

  if (timeline.length > 0) {
    lines.push("");
    lines.push("[OMEGA Session Timeline]");
    const recentEntries = timeline.slice(-OMEGA_PROMPT_HISTORY_LIMIT).reverse();
    recentEntries.forEach((entry, index) => {
      lines.push(`${index + 1}. ${formatTimelineEntry(entry)}`);
    });

    const recentFailures = recentEntries.filter((entry) => entry.outcome.status !== "ok");
    if (recentFailures.some((entry) => entry.outcome.errorKind === "invalid_structured_result")) {
      lines.push("A recent verified turn failed because the JSON contract was broken. Return exactly one JSON object when structured output is required.");
    }
    if (
      recentFailures.some((entry) =>
        ["target_not_touched", "missing_target_writes"].includes(entry.outcome.errorKind ?? ""),
      )
    ) {
      lines.push("A recent verified turn failed because required targets were not actually modified. Touch every required path before claiming success.");
    }
  }

  return lines.join("\n");
}

export async function recordOmegaSessionOutcome(params: {
  workspaceRoot: string;
  sessionKey: string;
  task: string;
  validation: OmegaSessionValidationSnapshot;
  outcome: OmegaSessionOutcomeSnapshot;
  reply?: string;
  execution?: OmegaTaskTransactionExecutionSnapshot;
  recordEmpiricalMetrics?: boolean;
}): Promise<void> {
  const canonicalSessionKey = canonicalizeOmegaSessionKey(params.sessionKey);
  const stateDir = resolveOmegaSessionStateDir(params.workspaceRoot);
  await fs.mkdir(stateDir, { recursive: true });

  const existing = await readOmegaSessionTimeline({
    workspaceRoot: params.workspaceRoot,
    sessionKey: canonicalSessionKey,
  });
  const entries = [...(existing?.entries ?? [])];
  const causalTargets = deriveTimelineCausalTargets({
    validation: params.validation,
    priorState: existing?.state,
    priorKernel: existing?.kernel,
  });
  const newEntry: OmegaSessionTimelineEntry = {
    createdAt: Date.now(),
    task: params.task,
    validation: params.validation,
    outcome: params.outcome,
    ...(causalTargets.length > 0 ? { causalTargets } : {}),
    ...(typeof params.reply === "string" && params.reply.length > 0 ? { reply: params.reply } : {}),
  };
  entries.push(newEntry);
  const nextState = deriveOmegaSessionSelfState({
    priorState: existing?.state,
    task: params.task,
    validation: params.validation,
    outcome: params.outcome,
    timeline: entries.slice(0, -1),
  });
  const nextKernel = deriveOmegaSelfTimeKernel({
    priorState: existing?.kernel,
    sessionKey: canonicalSessionKey,
    task: params.task,
    validation: params.validation,
    outcome: params.outcome,
    timeline: entries.slice(0, -1),
  });
  const nextTransactions = updateOmegaTaskTransactions({
    priorTransactions: existing?.transactions ?? [],
    priorKernel: existing?.kernel,
    nextKernel,
    task: params.task,
    validation: params.validation,
    outcome: params.outcome,
    execution: params.execution,
  });

  const stateFile = resolveOmegaSessionStateFile({
    workspaceRoot: params.workspaceRoot,
    sessionKey: canonicalSessionKey,
  });
  const payload: OmegaSessionTimelineFile = {
    sessionKey: canonicalSessionKey,
    updatedAt: Date.now(),
    entries: entries.slice(-OMEGA_SESSION_HISTORY_LIMIT),
    state: nextState,
    kernel: nextKernel,
    transactions: nextTransactions,
  };
  await fs.writeFile(stateFile, JSON.stringify(payload, null, 2), "utf-8");
  await syncOmegaEpisodeMemoryDigest({
    workspaceRoot: params.workspaceRoot,
    sessionKey: canonicalSessionKey,
    transactions: nextTransactions,
  }).catch(() => undefined);
  if (params.recordEmpiricalMetrics !== false) {
    await recordOmegaValidationMetrics({
      workspaceRoot: params.workspaceRoot,
      validation: params.validation,
      outcome: params.outcome,
    }).catch(() => undefined);
  }
}

export function summarizeValidationOutcome(
  validation: OmegaSessionTaskValidationSummary | undefined,
): Pick<OmegaSessionOutcomeSnapshot, "structuredOk" | "writeOk"> {
  return {
    structuredOk: validation?.structured?.ok,
    writeOk: validation?.write?.ok,
  };
}
