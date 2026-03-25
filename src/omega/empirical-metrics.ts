import fs from "node:fs/promises";
import path from "node:path";
import type {
  OmegaSessionOutcomeSnapshot,
  OmegaSessionValidationSnapshot,
} from "./session-context.js";

const OMEGA_EMPIRICAL_METRICS_VERSION = 1;
const FALSE_SUCCESS_ERROR_KINDS = new Set([
  "invalid_structured_result",
  "target_not_touched",
  "missing_target_writes",
]);

export type OmegaEmpiricalRoute =
  | "frontal_cache"
  | "omega_delegate"
  | "sessions_spawn"
  | "sessions_send";

export type OmegaEmpiricalMetrics = {
  version: number;
  updatedAt: number;
  validation: {
    recordedOutcomes: number;
    validatedOutcomes: number;
    preventedFalseSuccesses: number;
    falseSuccessRate: number;
  };
  routing: {
    toolTasks: number;
    llmCallsEstimated: number;
    llmCallsSaved: number;
    meanLlmCallsPerToolTask: number;
    routeCounts: Partial<Record<OmegaEmpiricalRoute, number>>;
  };
  background: {
    usefulActions: number;
  };
  heartbeat: {
    cyclesStarted: number;
    cyclesCompleted: number;
    executiveActions: number;
    usefulExecutiveActions: number;
    structuredTerminations: number;
    textTokenTerminations: number;
    iterations: number;
  };
  /** Recovery strategy empirical data — used by world-model.ts to derive routing preferences */
  recovery: {
    strategies: Record<string, { attempts: number; successes: number; failures: number }>;
  };
};

function createDefaultOmegaEmpiricalMetrics(): OmegaEmpiricalMetrics {
  return {
    version: OMEGA_EMPIRICAL_METRICS_VERSION,
    updatedAt: 0,
    validation: {
      recordedOutcomes: 0,
      validatedOutcomes: 0,
      preventedFalseSuccesses: 0,
      falseSuccessRate: 0,
    },
    routing: {
      toolTasks: 0,
      llmCallsEstimated: 0,
      llmCallsSaved: 0,
      meanLlmCallsPerToolTask: 0,
      routeCounts: {},
    },
    background: {
      usefulActions: 0,
    },
    heartbeat: {
      cyclesStarted: 0,
      cyclesCompleted: 0,
      executiveActions: 0,
      usefulExecutiveActions: 0,
      structuredTerminations: 0,
      textTokenTerminations: 0,
      iterations: 0,
    },
    recovery: {
      strategies: {},
    },
  };
}

function resolveMetricsDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".openskynet");
}

export function resolveOmegaEmpiricalMetricsFile(workspaceRoot: string): string {
  return path.join(resolveMetricsDir(workspaceRoot), "omega-empirical-metrics.json");
}

function clampNonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function normalizeRouteCounts(value: unknown): Partial<Record<OmegaEmpiricalRoute, number>> {
  if (!value || typeof value !== "object") {
    return {};
  }
  const input = value as Partial<Record<OmegaEmpiricalRoute, unknown>>;
  const counts: Partial<Record<OmegaEmpiricalRoute, number>> = {};
  const routes: OmegaEmpiricalRoute[] = [
    "frontal_cache",
    "omega_delegate",
    "sessions_spawn",
    "sessions_send",
  ];
  for (const route of routes) {
    const count = clampNonNegativeInteger(input[route]);
    if (count > 0) {
      counts[route] = count;
    }
  }
  return counts;
}

function withDerivedOmegaEmpiricalMetrics(metrics: OmegaEmpiricalMetrics): OmegaEmpiricalMetrics {
  const validatedOutcomes = clampNonNegativeInteger(metrics.validation.validatedOutcomes);
  const preventedFalseSuccesses = clampNonNegativeInteger(
    metrics.validation.preventedFalseSuccesses,
  );
  const toolTasks = clampNonNegativeInteger(metrics.routing.toolTasks);
  const llmCallsEstimated = clampNonNegativeInteger(metrics.routing.llmCallsEstimated);

  return {
    version: OMEGA_EMPIRICAL_METRICS_VERSION,
    updatedAt:
      typeof metrics.updatedAt === "number" && Number.isFinite(metrics.updatedAt)
        ? metrics.updatedAt
        : 0,
    validation: {
      recordedOutcomes: clampNonNegativeInteger(metrics.validation.recordedOutcomes),
      validatedOutcomes,
      preventedFalseSuccesses,
      falseSuccessRate: validatedOutcomes > 0 ? preventedFalseSuccesses / validatedOutcomes : 0,
    },
    routing: {
      toolTasks,
      llmCallsEstimated,
      llmCallsSaved: clampNonNegativeInteger(metrics.routing.llmCallsSaved),
      meanLlmCallsPerToolTask: toolTasks > 0 ? llmCallsEstimated / toolTasks : 0,
      routeCounts: normalizeRouteCounts(metrics.routing.routeCounts),
    },
    background: {
      usefulActions: clampNonNegativeInteger(metrics.background.usefulActions),
    },
    heartbeat: {
      cyclesStarted: clampNonNegativeInteger(metrics.heartbeat.cyclesStarted),
      cyclesCompleted: clampNonNegativeInteger(metrics.heartbeat.cyclesCompleted),
      executiveActions: clampNonNegativeInteger(metrics.heartbeat.executiveActions),
      usefulExecutiveActions: clampNonNegativeInteger(metrics.heartbeat.usefulExecutiveActions),
      structuredTerminations: clampNonNegativeInteger(metrics.heartbeat.structuredTerminations),
      textTokenTerminations: clampNonNegativeInteger(metrics.heartbeat.textTokenTerminations),
      iterations: clampNonNegativeInteger(metrics.heartbeat.iterations),
    },
    recovery: {
      strategies: metrics.recovery?.strategies ?? {},
    },
  };
}

function parseOmegaEmpiricalMetrics(raw: unknown): OmegaEmpiricalMetrics {
  const base = createDefaultOmegaEmpiricalMetrics();
  if (!raw || typeof raw !== "object") {
    return base;
  }
  const parsed = raw as Partial<OmegaEmpiricalMetrics>;
  return withDerivedOmegaEmpiricalMetrics({
    version: OMEGA_EMPIRICAL_METRICS_VERSION,
    updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
    validation: {
      recordedOutcomes: clampNonNegativeInteger(parsed.validation?.recordedOutcomes),
      validatedOutcomes: clampNonNegativeInteger(parsed.validation?.validatedOutcomes),
      preventedFalseSuccesses: clampNonNegativeInteger(parsed.validation?.preventedFalseSuccesses),
      falseSuccessRate: 0,
    },
    routing: {
      toolTasks: clampNonNegativeInteger(parsed.routing?.toolTasks),
      llmCallsEstimated: clampNonNegativeInteger(parsed.routing?.llmCallsEstimated),
      llmCallsSaved: clampNonNegativeInteger(parsed.routing?.llmCallsSaved),
      meanLlmCallsPerToolTask: 0,
      routeCounts: normalizeRouteCounts(parsed.routing?.routeCounts),
    },
    background: {
      usefulActions: clampNonNegativeInteger(parsed.background?.usefulActions),
    },
    heartbeat: {
      cyclesStarted: clampNonNegativeInteger(parsed.heartbeat?.cyclesStarted),
      cyclesCompleted: clampNonNegativeInteger(parsed.heartbeat?.cyclesCompleted),
      executiveActions: clampNonNegativeInteger(parsed.heartbeat?.executiveActions),
      usefulExecutiveActions: clampNonNegativeInteger(parsed.heartbeat?.usefulExecutiveActions),
      structuredTerminations: clampNonNegativeInteger(parsed.heartbeat?.structuredTerminations),
      textTokenTerminations: clampNonNegativeInteger(parsed.heartbeat?.textTokenTerminations),
      iterations: clampNonNegativeInteger(parsed.heartbeat?.iterations),
    },
    recovery: {
      strategies: (parsed as Partial<OmegaEmpiricalMetrics>).recovery?.strategies ?? {},
    },
  });
}

export async function loadOmegaEmpiricalMetrics(params: {
  workspaceRoot: string;
}): Promise<OmegaEmpiricalMetrics> {
  const file = resolveOmegaEmpiricalMetricsFile(params.workspaceRoot);
  try {
    const raw = await fs.readFile(file, "utf-8");
    return parseOmegaEmpiricalMetrics(JSON.parse(raw));
  } catch {
    return createDefaultOmegaEmpiricalMetrics();
  }
}

async function updateOmegaEmpiricalMetrics(
  workspaceRoot: string,
  update: (metrics: OmegaEmpiricalMetrics) => OmegaEmpiricalMetrics,
): Promise<OmegaEmpiricalMetrics> {
  const current = await loadOmegaEmpiricalMetrics({ workspaceRoot });
  const next = withDerivedOmegaEmpiricalMetrics(update(current));
  next.updatedAt = Date.now();
  await fs.mkdir(resolveMetricsDir(workspaceRoot), { recursive: true });
  await fs.writeFile(
    resolveOmegaEmpiricalMetricsFile(workspaceRoot),
    JSON.stringify(next, null, 2),
    "utf-8",
  );
  return next;
}

export async function recordOmegaValidationMetrics(params: {
  workspaceRoot: string;
  validation: OmegaSessionValidationSnapshot;
  outcome: OmegaSessionOutcomeSnapshot;
}): Promise<OmegaEmpiricalMetrics> {
  const requiresValidation =
    params.validation.expectsJson ||
    params.validation.expectedKeys.length > 0 ||
    params.validation.expectedPaths.length > 0;
  const preventedFalseSuccess =
    typeof params.outcome.errorKind === "string" &&
    FALSE_SUCCESS_ERROR_KINDS.has(params.outcome.errorKind);

  return updateOmegaEmpiricalMetrics(params.workspaceRoot, (metrics) => ({
    ...metrics,
    validation: {
      ...metrics.validation,
      recordedOutcomes: metrics.validation.recordedOutcomes + 1,
      validatedOutcomes: metrics.validation.validatedOutcomes + (requiresValidation ? 1 : 0),
      preventedFalseSuccesses:
        metrics.validation.preventedFalseSuccesses + (preventedFalseSuccess ? 1 : 0),
      falseSuccessRate: metrics.validation.falseSuccessRate,
    },
  }));
}

export async function recordOmegaRouteMetrics(params: {
  workspaceRoot: string;
  route: OmegaEmpiricalRoute;
  llmCallsEstimated?: number;
  llmCallsSaved?: number;
}): Promise<OmegaEmpiricalMetrics> {
  return updateOmegaEmpiricalMetrics(params.workspaceRoot, (metrics) => ({
    ...metrics,
    routing: {
      ...metrics.routing,
      toolTasks: metrics.routing.toolTasks + 1,
      llmCallsEstimated:
        metrics.routing.llmCallsEstimated + clampNonNegativeInteger(params.llmCallsEstimated),
      llmCallsSaved: metrics.routing.llmCallsSaved + clampNonNegativeInteger(params.llmCallsSaved),
      meanLlmCallsPerToolTask: metrics.routing.meanLlmCallsPerToolTask,
      routeCounts: {
        ...metrics.routing.routeCounts,
        [params.route]: (metrics.routing.routeCounts[params.route] ?? 0) + 1,
      },
    },
  }));
}

export async function recordOmegaBackgroundActionMetrics(params: {
  workspaceRoot: string;
  usefulActions?: number;
}): Promise<OmegaEmpiricalMetrics> {
  return updateOmegaEmpiricalMetrics(params.workspaceRoot, (metrics) => ({
    ...metrics,
    background: {
      usefulActions:
        metrics.background.usefulActions + clampNonNegativeInteger(params.usefulActions),
    },
  }));
}

export async function recordOmegaRecoveryStrategyMetrics(params: {
  workspaceRoot: string;
  strategy: string;
  success: boolean;
}): Promise<OmegaEmpiricalMetrics> {
  return updateOmegaEmpiricalMetrics(params.workspaceRoot, (metrics) => {
    const strategies = { ...metrics.recovery?.strategies };
    const stats = strategies[params.strategy] ?? { attempts: 0, successes: 0, failures: 0 };
    strategies[params.strategy] = {
      attempts: stats.attempts + 1,
      successes: stats.successes + (params.success ? 1 : 0),
      failures: stats.failures + (params.success ? 0 : 1),
    };
    return {
      ...metrics,
      recovery: {
        strategies,
      },
    };
  });
}

export async function recordOmegaHeartbeatCycleMetrics(params: {
  workspaceRoot: string;
  started?: boolean;
  completed?: boolean;
  executiveAction?: boolean;
  usefulExecutiveAction?: boolean;
  structuredTermination?: boolean;
  textTokenTermination?: boolean;
  iterations?: number;
}): Promise<OmegaEmpiricalMetrics> {
  return updateOmegaEmpiricalMetrics(params.workspaceRoot, (metrics) => ({
    ...metrics,
    heartbeat: {
      cyclesStarted: metrics.heartbeat.cyclesStarted + (params.started ? 1 : 0),
      cyclesCompleted: metrics.heartbeat.cyclesCompleted + (params.completed ? 1 : 0),
      executiveActions: metrics.heartbeat.executiveActions + (params.executiveAction ? 1 : 0),
      usefulExecutiveActions:
        metrics.heartbeat.usefulExecutiveActions + (params.usefulExecutiveAction ? 1 : 0),
      structuredTerminations:
        metrics.heartbeat.structuredTerminations + (params.structuredTermination ? 1 : 0),
      textTokenTerminations:
        metrics.heartbeat.textTokenTerminations + (params.textTokenTermination ? 1 : 0),
      iterations: metrics.heartbeat.iterations + clampNonNegativeInteger(params.iterations),
    },
  }));
}
