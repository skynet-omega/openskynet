import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { admitOmegaDurableMemory } from "./durable-memory.js";
import { recordOmegaValidationMetrics } from "./empirical-metrics.js";
import {
  formatOmegaRecoveryEpisodeRecall,
  loadOmegaRecoveryEpisodeRecall,
  syncOmegaEpisodeMemoryDigest,
} from "./episodic-recall.js";
import { deriveOmegaSessionSelfState, type OmegaSessionSelfState } from "./event-model.js";
import { buildScienceBasePromptSection } from "./science-base-reader.js";
import {
  deriveOmegaSelfTimeKernel,
  type OmegaKernelCausalEdge,
  type OmegaKernelCausalGraphState,
  type OmegaKernelGoal,
  type OmegaKernelTrackedFile,
  type OmegaSelfTimeKernelState,
} from "./self-time-kernel.js";
import {
  cloneOmegaTaskTransactions,
  parseOmegaTaskTransactions,
  selectActiveOmegaTaskTransaction,
  updateOmegaTaskTransactions,
  type OmegaTaskTransaction,
  type OmegaTaskTransactionExecutionSnapshot,
} from "./task-transaction.js";
import type { OmegaSessionTaskValidationSummary } from "./types.js";
export {
  deriveFocusedActiveTargets,
  deriveShadowedGoalTasks,
  deriveSupersededGoalTasks,
  focusActiveOmegaGoalTargets,
  pruneShadowedOmegaGoals,
  pruneStaleOmegaGoals,
  pruneSupersededOmegaGoals,
} from "./session-goal-maintenance.js";

const OMEGA_SESSION_HISTORY_LIMIT = 32;
const OMEGA_PROMPT_HISTORY_LIMIT = 3;

export type OmegaSessionValidationSnapshot = {
  expectsJson: boolean;
  expectedKeys: string[];
  expectedPaths: string[];
  watchedPaths?: string[];
};

export type OmegaSessionOutcomeSnapshot = {
  status: "ok" | "error" | "timeout";
  errorKind?: string;
  observedChangedFiles?: string[];
  structuredOk?: boolean;
  writeOk?: boolean;
  localityScore?: number;
  protectedPreservationRate?: number;
};

export type OmegaSessionTimelineEntry = {
  createdAt: number;
  task: string;
  validation: OmegaSessionValidationSnapshot;
  outcome: OmegaSessionOutcomeSnapshot;
  causalTargets?: string[];
  reply?: string;
};

export type OmegaSessionAuthority = {
  timeline: OmegaSessionTimelineEntry[];
  state?: OmegaSessionSelfState;
  kernel?: OmegaSelfTimeKernelState;
  transactions: OmegaTaskTransaction[];
};

export type OmegaSessionTimelineFile = {
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
    lastTargetedTurn: typeof file.lastTargetedTurn === "number" ? file.lastTargetedTurn : undefined,
    lastTargetGoalId: typeof file.lastTargetGoalId === "string" ? file.lastTargetGoalId : undefined,
    lastWriteAt: typeof file.lastWriteAt === "number" ? file.lastWriteAt : undefined,
    lastWriteTurn: typeof file.lastWriteTurn === "number" ? file.lastWriteTurn : undefined,
    lastWriterGoalId: typeof file.lastWriterGoalId === "string" ? file.lastWriterGoalId : undefined,
    lastFailureAt: typeof file.lastFailureAt === "number" ? file.lastFailureAt : undefined,
    lastFailureTurn: typeof file.lastFailureTurn === "number" ? file.lastFailureTurn : undefined,
    lastFailedGoalId: typeof file.lastFailedGoalId === "string" ? file.lastFailedGoalId : undefined,
    lastFailureKind: typeof file.lastFailureKind === "string" ? file.lastFailureKind : undefined,
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

function parseKernelIdentity(value: unknown): NonNullable<OmegaSelfTimeKernelState["identity"]> {
  if (!value || typeof value !== "object") {
    return {
      continuityId: "",
      firstSeenAt: 0,
      lastSeenAt: 0,
    };
  }
  const identity = value as Partial<OmegaSelfTimeKernelState["identity"]>;
  return {
    continuityId: typeof identity.continuityId === "string" ? identity.continuityId : "",
    firstSeenAt: typeof identity.firstSeenAt === "number" ? identity.firstSeenAt : 0,
    lastSeenAt: typeof identity.lastSeenAt === "number" ? identity.lastSeenAt : 0,
    lastTask: typeof identity.lastTask === "string" ? identity.lastTask : undefined,
    lastInteractionKind:
      typeof identity.lastInteractionKind === "string" ? identity.lastInteractionKind : undefined,
  };
}

function parseKernelWorld(value: unknown): NonNullable<OmegaSelfTimeKernelState["world"]> {
  if (!value || typeof value !== "object") {
    return {
      lastObservedChangedFiles: [],
    };
  }
  const world = value as Partial<OmegaSelfTimeKernelState["world"]>;
  return {
    lastOutcomeStatus:
      typeof world.lastOutcomeStatus === "string" ? world.lastOutcomeStatus : undefined,
    lastErrorKind: typeof world.lastErrorKind === "string" ? world.lastErrorKind : undefined,
    lastObservedChangedFiles: Array.isArray(world.lastObservedChangedFiles)
      ? world.lastObservedChangedFiles.filter(
          (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
        )
      : [],
    lastStructuredOk:
      typeof world.lastStructuredOk === "boolean" ? world.lastStructuredOk : undefined,
    lastWriteOk: typeof world.lastWriteOk === "boolean" ? world.lastWriteOk : undefined,
  };
}

function parseKernelGoals(value: unknown): OmegaKernelGoal[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter(
      (goal): goal is OmegaKernelGoal =>
        !!goal &&
        typeof goal === "object" &&
        typeof goal.id === "string" &&
        typeof goal.task === "string",
    )
    .map((goal) => ({
      id: goal.id,
      task: goal.task,
      targets: Array.isArray(goal.targets)
        ? goal.targets.filter(
            (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
          )
        : [],
      requiredKeys: Array.isArray(goal.requiredKeys)
        ? goal.requiredKeys.filter(
            (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
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
      lastErrorKind: typeof goal.lastErrorKind === "string" ? goal.lastErrorKind : undefined,
      lastInteractionKind:
        typeof goal.lastInteractionKind === "string" ? goal.lastInteractionKind : undefined,
      observedChangedFiles: Array.isArray(goal.observedChangedFiles)
        ? goal.observedChangedFiles.filter(
            (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
          )
        : [],
    }));
}

function parseKernelTension(value: unknown): NonNullable<OmegaSelfTimeKernelState["tension"]> {
  if (!value || typeof value !== "object") {
    return {
      openGoalCount: 0,
      staleGoalCount: 0,
      failureStreak: 0,
      repeatedFailureKinds: [],
      pendingCorrection: false,
    };
  }
  const tension = value as Partial<OmegaSelfTimeKernelState["tension"]>;
  return {
    openGoalCount: typeof tension.openGoalCount === "number" ? tension.openGoalCount : 0,
    staleGoalCount: typeof tension.staleGoalCount === "number" ? tension.staleGoalCount : 0,
    failureStreak: typeof tension.failureStreak === "number" ? tension.failureStreak : 0,
    repeatedFailureKinds: Array.isArray(tension.repeatedFailureKinds)
      ? tension.repeatedFailureKinds.filter(
          (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
        )
      : [],
    pendingCorrection: tension.pendingCorrection === true,
  };
}

function parseTimelineEntries(entries: unknown[]): OmegaSessionTimelineEntry[] {
  return entries
    .filter((entry): entry is OmegaSessionTimelineEntry => {
      if (!entry || typeof entry !== "object") {
        return false;
      }
      const candidate = entry as Partial<OmegaSessionTimelineEntry>;
      return (
        typeof candidate.createdAt === "number" &&
        typeof candidate.task === "string" &&
        !!candidate.validation &&
        !!candidate.outcome
      );
    })
    .map((entry) => {
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
    });
}

function parseSessionSelfState(value: unknown): OmegaSessionSelfState | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const state = value as Partial<OmegaSessionSelfState>;
  return {
    activeGoal: typeof state.activeGoal === "string" ? state.activeGoal : undefined,
    activeTargets: Array.isArray(state.activeTargets)
      ? state.activeTargets.filter(
          (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
        )
      : [],
    requiredKeys: Array.isArray(state.requiredKeys)
      ? state.requiredKeys.filter(
          (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
        )
      : [],
    lastInteractionKind:
      typeof state.lastInteractionKind === "string" ? state.lastInteractionKind : undefined,
    lastTask: typeof state.lastTask === "string" ? state.lastTask : undefined,
    lastOutcomeStatus:
      typeof state.lastOutcomeStatus === "string" ? state.lastOutcomeStatus : undefined,
    lastErrorKind: typeof state.lastErrorKind === "string" ? state.lastErrorKind : undefined,
    lastSuccessfulTask:
      typeof state.lastSuccessfulTask === "string" ? state.lastSuccessfulTask : undefined,
    lastFailedTask: typeof state.lastFailedTask === "string" ? state.lastFailedTask : undefined,
    learnedConstraints: Array.isArray(state.learnedConstraints)
      ? state.learnedConstraints.filter(
          (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
        )
      : [],
    updatedAt: typeof state.updatedAt === "number" ? state.updatedAt : 0,
  };
}

function parseSelfTimeKernel(
  value: unknown,
  fallbackSessionKey: string,
): OmegaSelfTimeKernelState | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const kernel = value as Partial<OmegaSelfTimeKernelState>;
  return {
    revision: typeof kernel.revision === "number" ? kernel.revision : 1,
    sessionKey:
      typeof kernel.sessionKey === "string"
        ? canonicalizeOmegaSessionKey(kernel.sessionKey)
        : fallbackSessionKey,
    turnCount: typeof kernel.turnCount === "number" ? kernel.turnCount : 0,
    activeGoalId: typeof kernel.activeGoalId === "string" ? kernel.activeGoalId : undefined,
    identity: parseKernelIdentity(kernel.identity),
    world: parseKernelWorld(kernel.world),
    goals: parseKernelGoals(kernel.goals),
    tension: parseKernelTension(kernel.tension),
    causalGraph: parseCausalGraph(kernel.causalGraph),
    updatedAt: typeof kernel.updatedAt === "number" ? kernel.updatedAt : 0,
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
    const legacyFile = path.join(
      resolveOmegaSessionStateDir(params.workspaceRoot),
      sanitizeSessionKey("main"),
    );
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
  return path.join(
    resolveOmegaSessionStateDir(params.workspaceRoot),
    sanitizeSessionKey(params.sessionKey),
  );
}

export async function readOmegaSessionTimeline(params: {
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
      const parsedKernel = parseSelfTimeKernel(parsed.kernel, canonicalSessionKey);

      return {
        sessionKey:
          typeof parsed.sessionKey === "string"
            ? canonicalizeOmegaSessionKey(parsed.sessionKey)
            : canonicalSessionKey,
        updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
        entries: parseTimelineEntries(parsed.entries),
        state: parseSessionSelfState(parsed.state),
        kernel: parsedKernel,
        transactions: parseOmegaTaskTransactions(parsed.transactions),
      };
    } catch {
      continue;
    }
  }
  return null;
}

export async function writeOmegaSessionTimelineFile(params: {
  workspaceRoot: string;
  sessionKey: string;
  payload: OmegaSessionTimelineFile;
}): Promise<void> {
  await fs.writeFile(
    resolveOmegaSessionStateFile({
      workspaceRoot: params.workspaceRoot,
      sessionKey: params.sessionKey,
    }),
    JSON.stringify(params.payload, null, 2),
    "utf-8",
  );
}

export async function loadOmegaSessionTimeline(params: {
  workspaceRoot: string;
  sessionKey: string;
}): Promise<OmegaSessionTimelineEntry[]> {
  return (await loadOmegaSessionAuthority(params)).timeline;
}

export async function loadOmegaSessionSelfState(params: {
  workspaceRoot: string;
  sessionKey: string;
}): Promise<OmegaSessionSelfState | undefined> {
  return (await loadOmegaSessionAuthority(params)).state;
}

export async function loadOmegaSelfTimeKernel(params: {
  workspaceRoot: string;
  sessionKey: string;
}): Promise<OmegaSelfTimeKernelState | undefined> {
  return (await loadOmegaSessionAuthority(params)).kernel;
}

export async function loadOmegaSessionAuthority(params: {
  workspaceRoot: string;
  sessionKey: string;
}): Promise<OmegaSessionAuthority> {
  const timeline = await readOmegaSessionTimeline(params);
  return {
    timeline: timeline?.entries ?? [],
    state: timeline?.state,
    kernel: timeline?.kernel,
    transactions: cloneOmegaTaskTransactions(timeline?.transactions ?? []),
  };
}

export async function loadOmegaSessionDecisionState(params: {
  workspaceRoot: string;
  sessionKey: string;
}): Promise<{
  timeline: OmegaSessionTimelineEntry[];
  state?: OmegaSessionSelfState;
  kernel?: OmegaSelfTimeKernelState;
}> {
  const snapshot = await loadOmegaSessionAuthority(params);
  return {
    timeline: snapshot.timeline,
    state: snapshot.state,
    kernel: snapshot.kernel,
  };
}

export async function loadOmegaTaskTransactions(params: {
  workspaceRoot: string;
  sessionKey: string;
}): Promise<OmegaTaskTransaction[]> {
  return (await loadOmegaSessionAuthority(params)).transactions;
}

export async function loadOmegaSessionRuntimeSnapshot(params: {
  workspaceRoot: string;
  sessionKey: string;
}): Promise<{
  kernel?: OmegaSelfTimeKernelState;
  timeline: OmegaSessionTimelineEntry[];
}> {
  const file = await loadOmegaSessionAuthority(params);
  return {
    kernel: file.kernel,
    timeline: file.timeline,
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
      lines.push(`Kernel repeated failures: ${kernel.tension.repeatedFailureKinds.join(", ")}`);
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
      lines.push(
        "A recent verified turn failed because the JSON contract was broken. Return exactly one JSON object when structured output is required.",
      );
    }
    if (
      recentFailures.some((entry) =>
        ["target_not_touched", "missing_target_writes"].includes(entry.outcome.errorKind ?? ""),
      )
    ) {
      lines.push(
        "A recent verified turn failed because required targets were not actually modified. Touch every required path before claiming success.",
      );
    }
  }

  // ── OMEGA Learned Invariants: inyectar patrones causales desde SCIENCE_BASE.md
  // Esto simula "soft weight modification": el LLM activa sesgando decisiones
  // en base a patrones empíricamente verificados en sesiones anteriores.
  const scienceBaseBlock = await buildScienceBasePromptSection({
    workspaceRoot: params.workspaceRoot,
    relevantTask: params.task,
    limit: 6,
  });
  if (scienceBaseBlock) {
    lines.push("");
    lines.push(scienceBaseBlock);
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
  await admitOmegaDurableMemory({
    workspaceRoot: params.workspaceRoot,
    sessionKey: canonicalSessionKey,
    task: params.task,
    learnedConstraints: nextState.learnedConstraints,
    validation: params.validation,
    outcome: params.outcome,
  }).catch(() => undefined);
  if (params.recordEmpiricalMetrics !== false) {
    await recordOmegaValidationMetrics({
      workspaceRoot: params.workspaceRoot,
      validation: params.validation,
      outcome: params.outcome,
    }).catch(() => undefined);
  }

  // ── FRENTE A: Memoria Causal Útil ──────────────────────────────────────────
  // Si el outcome fue exitoso y modificó archivos, registrar una regla causal
  // en SCIENCE_BASE.md. El sistema "aprende qué funciona" acumulativamente.
  if (
    params.outcome.status === "ok" &&
    params.outcome.observedChangedFiles &&
    params.outcome.observedChangedFiles.length > 0
  ) {
    void appendScienceBaseRule({
      workspaceRoot: params.workspaceRoot,
      task: params.task,
      observedChangedFiles: params.outcome.observedChangedFiles,
      sessionKey: canonicalSessionKey,
    }).catch(() => undefined);
  }
}

/**
 * FRENTE A: Memoria Causal Útil
 *
 * Appends a verified causal flow rule to SCIENCE_BASE.md.
 * Each entry represents: "To achieve [task], write to [files]."
 * These invariants accumulate across sessions, making the system smarter over time.
 *
 * Format: Markdown table row for easy diffing and parsing.
 */
async function appendScienceBaseRule(params: {
  workspaceRoot: string;
  task: string;
  observedChangedFiles: string[];
  sessionKey: string;
}): Promise<void> {
  const scienceBasePath = path.join(params.workspaceRoot, "SCIENCE_BASE.md");
  const timestamp = new Date().toISOString().slice(0, 19).replace("T", " ");
  const files = params.observedChangedFiles.slice(0, 5).join(", "); // máximo 5

  // Crear entrada de regla causal
  const rule = `| ${timestamp} | ${params.task.slice(0, 80)} | ${files} | ${params.sessionKey} |\n`;

  // Asegurar que existe el archivo con header
  let existing = "";
  try {
    existing = await fs.readFile(scienceBasePath, "utf-8");
  } catch {
    // Archivo no existe — crear con header
    const header = [
      "# SCIENCE_BASE — Reglas Causales Verificadas",
      "",
      "> Generado automáticamente por Omega. Cada fila = patrón de éxito verificado.",
      "> Formato: tarea → archivos modificados.",
      "",
      "| Timestamp | Tarea | Archivos Modificados | Sesión |",
      "|-----------|-------|---------------------|--------|",
      "",
    ].join("\n");
    existing = header;
  }

  // Evitar duplicados exactos (misma tarea + mismos archivos)
  if (existing.includes(files) && existing.includes(params.task.slice(0, 40))) {
    return;
  }

  // Insertar antes del último bloque vacío o al final
  const newContent = existing.trimEnd() + "\n" + rule;
  await fs.writeFile(scienceBasePath, newContent, "utf-8");
}

export function summarizeValidationOutcome(
  validation: OmegaSessionTaskValidationSummary | undefined,
): Pick<OmegaSessionOutcomeSnapshot, "structuredOk" | "writeOk"> {
  return {
    structuredOk: validation?.structured?.ok,
    writeOk: validation?.write?.ok,
  };
}
