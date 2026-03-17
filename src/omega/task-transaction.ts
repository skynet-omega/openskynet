import crypto from "node:crypto";
import type { OmegaEmpiricalRoute } from "./empirical-metrics.js";
import {
  deriveOmegaInterruptedGoalRecovery,
  OMEGA_AUTONOMOUS_RECOVERY_MAX_FAILURE_STREAK,
} from "./recovery.js";
import type { OmegaKernelGoal, OmegaSelfTimeKernelState } from "./self-time-kernel.js";

const OMEGA_TRANSACTION_ATTEMPT_LIMIT = 8;
const OMEGA_TRANSACTION_LEDGER_LIMIT = 12;

type OmegaTransactionValidationSnapshot = {
  expectsJson: boolean;
  expectedKeys: string[];
  expectedPaths: string[];
};

type OmegaTransactionOutcomeSnapshot = {
  status: "ok" | "error" | "timeout";
  errorKind?: string;
  observedChangedFiles?: string[];
  structuredOk?: boolean;
  writeOk?: boolean;
};

export type OmegaTaskTransactionExecutionSnapshot = {
  route?: OmegaEmpiricalRoute;
  runId?: string;
  resumedFromKernel?: boolean;
  trigger?: "direct" | "heartbeat";
};

export type OmegaTaskTransactionAttempt = {
  createdAt: number;
  status: "ok" | "error" | "timeout";
  errorKind?: string;
  observedChangedFiles: string[];
  route?: OmegaEmpiricalRoute;
  runId?: string;
  resumedFromKernel: boolean;
  trigger: "direct" | "heartbeat";
};

export type OmegaTaskTransactionRecoveryStep = {
  kind: "none" | "resume" | "reroute" | "abort";
  reason: string;
  route?: OmegaEmpiricalRoute;
  remainingTargets: string[];
  requiredKeys: string[];
};

export type OmegaTaskTransaction = {
  id: string;
  goalId?: string;
  task: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  status: "active" | "completed";
  validation: OmegaTransactionValidationSnapshot;
  attempts: OmegaTaskTransactionAttempt[];
  verifiedOutcome: OmegaTransactionOutcomeSnapshot;
  nextRecoveryStep: OmegaTaskTransactionRecoveryStep;
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
  ).sort();
}

function normalizeObservedFiles(value: unknown): string[] {
  return Array.isArray(value)
    ? normalizeList(value.filter((entry): entry is string => typeof entry === "string"))
    : [];
}

function sameTargets(left: string[], right: string[]): boolean {
  return JSON.stringify(normalizeList(left)) === JSON.stringify(normalizeList(right));
}

function matchesGoal(params: {
  goal: OmegaKernelGoal;
  task: string;
  validation: OmegaTransactionValidationSnapshot;
}): boolean {
  if (params.validation.expectedPaths.length > 0) {
    return sameTargets(params.goal.targets, params.validation.expectedPaths);
  }
  return normalizeText(params.goal.task) === normalizeText(params.task);
}

function resolveRelevantGoal(params: {
  priorKernel?: OmegaSelfTimeKernelState;
  nextKernel?: OmegaSelfTimeKernelState;
  task: string;
  validation: OmegaTransactionValidationSnapshot;
}): OmegaKernelGoal | undefined {
  const nextActiveGoal = params.nextKernel?.activeGoalId
    ? params.nextKernel.goals.find((goal) => goal.id === params.nextKernel?.activeGoalId)
    : undefined;
  const priorActiveGoal = params.priorKernel?.activeGoalId
    ? params.priorKernel.goals.find((goal) => goal.id === params.priorKernel?.activeGoalId)
    : undefined;

  if (nextActiveGoal && matchesGoal({
    goal: nextActiveGoal,
    task: params.task,
    validation: params.validation,
  })) {
    return nextActiveGoal;
  }
  if (
    nextActiveGoal &&
    params.validation.expectedPaths.length === 0 &&
    priorActiveGoal &&
    priorActiveGoal.id === nextActiveGoal.id
  ) {
    return nextActiveGoal;
  }

  const nextMatchingGoal = [...(params.nextKernel?.goals ?? [])]
    .sort((left, right) => right.updatedTurn - left.updatedTurn)
    .find((goal) => matchesGoal({
      goal,
      task: params.task,
      validation: params.validation,
    }));
  if (nextMatchingGoal) {
    return nextMatchingGoal;
  }

  if (
    priorActiveGoal &&
    matchesGoal({
      goal: priorActiveGoal,
      task: params.task,
      validation: params.validation,
    })
  ) {
    return priorActiveGoal;
  }

  return undefined;
}

function createTransactionId(
  task: string,
  validation: OmegaTransactionValidationSnapshot,
  createdAt: number,
): string {
  return crypto
    .createHash("sha256")
    .update(
      [
        normalizeText(task),
        normalizeList(validation.expectedPaths).join("|"),
        normalizeList(validation.expectedKeys).join("|"),
        String(createdAt),
      ].join("::"),
    )
    .digest("hex")
    .slice(0, 16);
}

function cloneAttempt(attempt: OmegaTaskTransactionAttempt): OmegaTaskTransactionAttempt {
  return {
    ...attempt,
    observedChangedFiles: [...attempt.observedChangedFiles],
  };
}

export function cloneOmegaTaskTransactions(
  transactions: OmegaTaskTransaction[],
): OmegaTaskTransaction[] {
  return transactions.map((transaction) => ({
    ...transaction,
    validation: {
      expectsJson: transaction.validation.expectsJson,
      expectedKeys: [...transaction.validation.expectedKeys],
      expectedPaths: [...transaction.validation.expectedPaths],
    },
    attempts: transaction.attempts.map(cloneAttempt),
    verifiedOutcome: {
      ...transaction.verifiedOutcome,
      observedChangedFiles: [...(transaction.verifiedOutcome.observedChangedFiles ?? [])],
    },
    nextRecoveryStep: {
      ...transaction.nextRecoveryStep,
      remainingTargets: [...transaction.nextRecoveryStep.remainingTargets],
      requiredKeys: [...transaction.nextRecoveryStep.requiredKeys],
    },
  }));
}

function parseAttempt(value: unknown): OmegaTaskTransactionAttempt | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const attempt = value as Partial<OmegaTaskTransactionAttempt>;
  const status =
    attempt.status === "ok" || attempt.status === "error" || attempt.status === "timeout"
      ? attempt.status
      : undefined;
  const trigger = attempt.trigger === "heartbeat" ? "heartbeat" : "direct";
  if (!status || typeof attempt.createdAt !== "number") {
    return undefined;
  }
  const route =
    attempt.route === "frontal_cache" ||
    attempt.route === "omega_delegate" ||
    attempt.route === "sessions_spawn" ||
    attempt.route === "sessions_send"
      ? attempt.route
      : undefined;
  return {
    createdAt: attempt.createdAt,
    status,
    errorKind: typeof attempt.errorKind === "string" ? attempt.errorKind : undefined,
    observedChangedFiles: normalizeObservedFiles(attempt.observedChangedFiles),
    route,
    runId: typeof attempt.runId === "string" ? attempt.runId : undefined,
    resumedFromKernel: attempt.resumedFromKernel === true,
    trigger,
  };
}

export function parseOmegaTaskTransactions(value: unknown): OmegaTaskTransaction[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const parsed = value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return undefined;
      }
      const transaction = entry as Partial<OmegaTaskTransaction>;
      const status = transaction.status === "completed" ? "completed" : "active";
      if (
        typeof transaction.id !== "string" ||
        typeof transaction.task !== "string" ||
        typeof transaction.createdAt !== "number" ||
        typeof transaction.updatedAt !== "number"
      ) {
        return undefined;
      }
      const nextRecoveryStep = transaction.nextRecoveryStep;
      const parsedRecoveryStep: OmegaTaskTransactionRecoveryStep =
        nextRecoveryStep && typeof nextRecoveryStep === "object"
          ? {
              kind:
                nextRecoveryStep.kind === "resume" ||
                nextRecoveryStep.kind === "reroute" ||
                nextRecoveryStep.kind === "abort"
                  ? (nextRecoveryStep.kind as "resume" | "reroute" | "abort")
                  : ("none" as const),
              reason:
                typeof nextRecoveryStep.reason === "string"
                  ? nextRecoveryStep.reason
                  : "no_verified_recovery_step",
              route:
                nextRecoveryStep.route === "frontal_cache" ||
                nextRecoveryStep.route === "omega_delegate" ||
                nextRecoveryStep.route === "sessions_spawn" ||
                nextRecoveryStep.route === "sessions_send"
                  ? (nextRecoveryStep.route as OmegaEmpiricalRoute)
                  : undefined,
              remainingTargets: normalizeObservedFiles(nextRecoveryStep.remainingTargets),
              requiredKeys: normalizeObservedFiles(nextRecoveryStep.requiredKeys),
            }
          : {
              kind: "none" as const,
              reason: "no_verified_recovery_step",
              remainingTargets: [] as const as string[],
              requiredKeys: [] as const as string[],
            };
      const attempts = Array.isArray(transaction.attempts)
        ? transaction.attempts
            .map(parseAttempt)
            .filter((attempt): attempt is OmegaTaskTransactionAttempt => attempt !== undefined)
        : [];
      return {
        id: transaction.id,
        goalId: typeof transaction.goalId === "string" ? transaction.goalId : undefined,
        task: transaction.task,
        createdAt: transaction.createdAt,
        updatedAt: transaction.updatedAt,
        completedAt:
          typeof transaction.completedAt === "number" ? transaction.completedAt : undefined,
        status,
        validation: {
          expectsJson: transaction.validation?.expectsJson === true,
          expectedKeys: normalizeObservedFiles(transaction.validation?.expectedKeys),
          expectedPaths: normalizeObservedFiles(transaction.validation?.expectedPaths),
        },
        attempts,
        verifiedOutcome: {
          status:
            transaction.verifiedOutcome?.status === "error" ||
            transaction.verifiedOutcome?.status === "timeout"
              ? transaction.verifiedOutcome.status
              : "ok",
          errorKind:
            typeof transaction.verifiedOutcome?.errorKind === "string"
              ? transaction.verifiedOutcome.errorKind
              : undefined,
          observedChangedFiles: normalizeObservedFiles(
            transaction.verifiedOutcome?.observedChangedFiles,
          ),
          structuredOk:
            typeof transaction.verifiedOutcome?.structuredOk === "boolean"
              ? transaction.verifiedOutcome.structuredOk
              : undefined,
          writeOk:
            typeof transaction.verifiedOutcome?.writeOk === "boolean"
              ? transaction.verifiedOutcome.writeOk
              : undefined,
        },
        nextRecoveryStep: parsedRecoveryStep,
      } satisfies OmegaTaskTransaction;
    })
    .filter((entry) => entry !== undefined) as OmegaTaskTransaction[];

  return parsed
    .sort((left, right) => {
      const leftVal = left?.updatedAt;
      const rightVal = right?.updatedAt;
      if (typeof leftVal !== "number" || typeof rightVal !== "number") {
        return 0;
      }
      return leftVal - rightVal;
    })
    .filter((entry): entry is OmegaTaskTransaction => entry !== undefined)
    .slice(-OMEGA_TRANSACTION_LEDGER_LIMIT);
}

function normalizeRecoveryRoute(
  route: OmegaEmpiricalRoute | undefined,
  validation: OmegaTransactionValidationSnapshot,
): OmegaEmpiricalRoute {
  if (route === "omega_delegate" || route === "sessions_spawn" || route === "sessions_send") {
    return route;
  }
  if (validation.expectedPaths.length > 1) {
    return "sessions_spawn";
  }
  if (
    validation.expectedPaths.length > 0 ||
    validation.expectedKeys.length > 0 ||
    validation.expectsJson
  ) {
    return "omega_delegate";
  }
  return "sessions_send";
}

function deriveRecoveryStep(params: {
  validation: OmegaTransactionValidationSnapshot;
  outcome: OmegaTransactionOutcomeSnapshot;
  execution?: OmegaTaskTransactionExecutionSnapshot;
  recovery?: NonNullable<ReturnType<typeof deriveOmegaInterruptedGoalRecovery>>;
  status: "active" | "completed";
}): OmegaTaskTransactionRecoveryStep {
  if (params.status === "completed") {
    return {
      kind: "none",
      reason: "verified_success",
      remainingTargets: [],
      requiredKeys: [],
    };
  }

  if (params.recovery) {
    if (params.recovery.failureStreak > OMEGA_AUTONOMOUS_RECOVERY_MAX_FAILURE_STREAK) {
      return {
        kind: "abort",
        reason: "failure_streak_too_high",
        route: params.recovery.suggestedRoute,
        remainingTargets: [...params.recovery.remainingTargets],
        requiredKeys: [...params.recovery.requiredKeys],
      };
    }
    const attemptedRoute = normalizeRecoveryRoute(params.execution?.route, params.validation);
    return {
      kind: attemptedRoute === params.recovery.suggestedRoute ? "resume" : "reroute",
      reason: params.recovery.reason,
      route: params.recovery.suggestedRoute,
      remainingTargets: [...params.recovery.remainingTargets],
      requiredKeys: [...params.recovery.requiredKeys],
    };
  }

  if (params.outcome.status === "timeout") {
    return {
      kind: "resume",
      reason: "timeout_waiting_for_completion",
      route: normalizeRecoveryRoute(params.execution?.route, params.validation),
      remainingTargets: [...params.validation.expectedPaths],
      requiredKeys: [...params.validation.expectedKeys],
    };
  }

  return {
    kind: "none",
    reason: "no_verified_recovery_step",
    remainingTargets: [...params.validation.expectedPaths],
    requiredKeys: [...params.validation.expectedKeys],
  };
}

function buildAttempt(params: {
  outcome: OmegaTransactionOutcomeSnapshot;
  execution?: OmegaTaskTransactionExecutionSnapshot;
}): OmegaTaskTransactionAttempt {
  return {
    createdAt: Date.now(),
    status: params.outcome.status,
    errorKind: params.outcome.errorKind,
    observedChangedFiles: normalizeObservedFiles(params.outcome.observedChangedFiles),
    route: params.execution?.route,
    runId: params.execution?.runId,
    resumedFromKernel: params.execution?.resumedFromKernel === true,
    trigger: params.execution?.trigger === "heartbeat" ? "heartbeat" : "direct",
  };
}

function resolveTransactionIndex(params: {
  transactions: OmegaTaskTransaction[];
  goal?: OmegaKernelGoal;
  task: string;
  validation: OmegaTransactionValidationSnapshot;
}): number {
  if (params.goal?.id) {
    const index = params.transactions.findIndex(
      (transaction) => transaction.status === "active" && transaction.goalId === params.goal?.id,
    );
    if (index >= 0) {
      return index;
    }
  }

  if (params.validation.expectedPaths.length > 0) {
    const index = params.transactions.findIndex(
      (transaction) =>
        transaction.status === "active" &&
        sameTargets(transaction.validation.expectedPaths, params.validation.expectedPaths),
    );
    if (index >= 0) {
      return index;
    }
  }

  return params.transactions.findIndex(
    (transaction) =>
      transaction.status === "active" &&
      normalizeText(transaction.task) === normalizeText(params.task),
  );
}

function pruneTransactions(
  transactions: OmegaTaskTransaction[],
): OmegaTaskTransaction[] {
  const sorted = [...transactions].sort((left, right) => left.updatedAt - right.updatedAt);
  const activeTransactions = sorted.filter((transaction) => transaction.status === "active");
  const completedTransactions = sorted
    .filter((transaction) => transaction.status === "completed")
    .slice(-Math.max(0, OMEGA_TRANSACTION_LEDGER_LIMIT - activeTransactions.length));
  return [...activeTransactions, ...completedTransactions].slice(-OMEGA_TRANSACTION_LEDGER_LIMIT);
}

export function selectActiveOmegaTaskTransaction(
  transactions: OmegaTaskTransaction[],
): OmegaTaskTransaction | undefined {
  return [...transactions]
    .filter((transaction) => transaction.status === "active")
    .sort((left, right) => right.updatedAt - left.updatedAt)[0];
}

export function updateOmegaTaskTransactions(params: {
  priorTransactions: OmegaTaskTransaction[];
  priorKernel?: OmegaSelfTimeKernelState;
  nextKernel?: OmegaSelfTimeKernelState;
  task: string;
  validation: OmegaTransactionValidationSnapshot;
  outcome: OmegaTransactionOutcomeSnapshot;
  execution?: OmegaTaskTransactionExecutionSnapshot;
}): OmegaTaskTransaction[] {
  const goal = resolveRelevantGoal({
    priorKernel: params.priorKernel,
    nextKernel: params.nextKernel,
    task: params.task,
    validation: params.validation,
  });
  const recovery = deriveOmegaInterruptedGoalRecovery({
    kernel: params.nextKernel,
  });
  const status: "active" | "completed" =
    goal?.status === "completed" || (!goal && params.outcome.status === "ok") ? "completed" : "active";
  const nextTransactions = cloneOmegaTaskTransactions(params.priorTransactions);
  const transactionIndex = resolveTransactionIndex({
    transactions: nextTransactions,
    goal,
    task: params.task,
    validation: params.validation,
  });

  const updatedAt = Date.now();
  const nextRecoveryStep = deriveRecoveryStep({
    validation: params.validation,
    outcome: params.outcome,
    execution: params.execution,
    recovery: recovery && (!goal?.id || recovery.goalId === goal.id) ? recovery : undefined,
    status,
  });
  const attempt = buildAttempt({
    outcome: params.outcome,
    execution: params.execution,
  });

  if (transactionIndex >= 0) {
    const current = nextTransactions[transactionIndex];
    nextTransactions[transactionIndex] = {
      ...current,
      goalId: goal?.id ?? current.goalId,
      task: goal?.task ?? current.task,
      updatedAt,
      completedAt: status === "completed" ? updatedAt : current.completedAt,
      status,
      validation: {
        expectsJson: params.validation.expectsJson,
        expectedKeys: [...params.validation.expectedKeys],
        expectedPaths: [...params.validation.expectedPaths],
      },
      attempts: [...current.attempts, attempt].slice(-OMEGA_TRANSACTION_ATTEMPT_LIMIT),
      verifiedOutcome: {
        ...params.outcome,
        observedChangedFiles: normalizeObservedFiles(params.outcome.observedChangedFiles),
      },
      nextRecoveryStep,
    };
    return pruneTransactions(nextTransactions);
  }

  nextTransactions.push({
    id: createTransactionId(params.task, params.validation, updatedAt),
    goalId: goal?.id,
    task: goal?.task ?? params.task,
    createdAt: updatedAt,
    updatedAt,
    completedAt: status === "completed" ? updatedAt : undefined,
    status,
    validation: {
      expectsJson: params.validation.expectsJson,
      expectedKeys: [...params.validation.expectedKeys],
      expectedPaths: [...params.validation.expectedPaths],
    },
    attempts: [attempt],
    verifiedOutcome: {
      ...params.outcome,
      observedChangedFiles: normalizeObservedFiles(params.outcome.observedChangedFiles),
    },
    nextRecoveryStep,
  });

  return pruneTransactions(nextTransactions);
}
