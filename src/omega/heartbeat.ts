import { recordOmegaHeartbeatCycleMetrics } from "./empirical-metrics.js";
import { deriveOmegaExecutiveActionStopReason } from "./execution-controller.js";
import {
  applyOmegaHeartbeatExecutiveAction,
  buildOmegaHeartbeatPrompt,
  runAutonomousLoop,
  runOneHeartbeatCycle,
  type OmegaHeartbeatExecutiveResult,
} from "./heartbeat-core.js";
import { loadOmegaSelfTimeKernel, loadOmegaSessionTimeline } from "./session-context.js";
export {
  applyOmegaHeartbeatExecutiveAction,
  buildOmegaHeartbeatPrompt,
  runAutonomousLoop,
  runOneHeartbeatCycle,
};
export type { OmegaHeartbeatExecutiveResult } from "./heartbeat-core.js";

// ── Dependency-injection types ────────────────────────────────────────────────

/**
 * Snapshot del runtime omega en un punto temporal.
 */
export interface OmegaHeartbeatRuntimeSnapshot {
  timeline: import("./session-context.js").OmegaSessionTimelineEntry[];
  kernel: import("./self-time-kernel.js").OmegaSelfTimeKernelState | undefined;
}

/**
 * Dependencias inyectables para el ciclo del heartbeat.
 * Permite testear sin LLM real, sin FS, sin red.
 */
export interface OmegaHeartbeatCycleDeps {
  /** Genera el prompt que se enviará al agente */
  buildPrompt: (params: {
    workspaceRoot: string;
    sessionKey: string;
  }) => Promise<string | undefined>;
  /** Lee snapshot del estado actual (kernel + timeline) */
  loadRuntimeSnapshot: (params: {
    workspaceRoot: string;
    sessionKey: string;
  }) => Promise<OmegaHeartbeatRuntimeSnapshot>;
  /** Envía el prompt al agente (sesiones, cron, etc.) */
  sendAgentTurn: (params: {
    workspaceRoot: string;
    sessionKey: string;
    prompt: string;
  }) => Promise<void>;
  /** Appends al log de consciencia sin bloquear el turno */
  appendConsciousnessLog: (params: { workspaceRoot: string; entry: string }) => Promise<void>;
  /** Aplica acción ejecutiva (pruning, resumption) */
  applyExecutiveAction: (params: {
    workspaceRoot: string;
    sessionKey: string;
  }) => Promise<OmegaHeartbeatExecutiveResult>;
  /** Lee la última respuesta del agente para detectar HEARTBEAT_OK */
  readLatestReply: (params: {
    workspaceRoot: string;
    sessionKey: string;
  }) => Promise<string | undefined>;
  /** Registra métricas de un turno */
  recordMetric: (params: {
    workspaceRoot: string;
    entry: OmegaHeartbeatTurnMetric;
  }) => Promise<void>;
  /** Crea directorios necesarios si no existen */
  ensureDirectories: (params: { workspaceRoot: string }) => Promise<void>;
  /** Sleep entre iteraciones */
  sleep: (ms: number) => Promise<void>;
}

export interface OmegaHeartbeatTurnMetric {
  kind: "heartbeat_iteration";
  iteration: number;
  terminationReason: string;
  progressObserved: boolean;
  latencyBreakdown: {
    sendAgentTurnMs: number;
    loadSnapshotMs: number;
    readLatestReplyMs: number;
    totalMs: number;
  };
}

// ── Turn decision ─────────────────────────────────────────────────────────────

export interface OmegaHeartbeatTurnDecision {
  shouldContinue: boolean;
  stopReason: "structured_idle" | "reply_heartbeat_ok" | "no_progress" | "active_goal" | "continue";
  replyHeartbeatOk: boolean;
  structuredIdleDetected: boolean;
}

/**
 * Decide si continuar el loop o detenerse.
 * Pura: solo lee estado, no escribe nada.
 */
export function deriveOmegaHeartbeatTurnDecision(params: {
  previousTimelineLength: number;
  previousKernelUpdatedAt: number | undefined;
  latestReply?: string | undefined;
  nextSnapshot: OmegaHeartbeatRuntimeSnapshot;
}): OmegaHeartbeatTurnDecision {
  const { previousTimelineLength, previousKernelUpdatedAt, latestReply, nextSnapshot } = params;

  const newTimelineLength = nextSnapshot.timeline.length;
  const kernelUpdated =
    nextSnapshot.kernel !== undefined && nextSnapshot.kernel.updatedAt !== previousKernelUpdatedAt;
  const timelineDelta = newTimelineLength - previousTimelineLength;
  const progressObserved = timelineDelta > 0 || kernelUpdated;

  const replyHeartbeatOk = typeof latestReply === "string" && latestReply.includes("HEARTBEAT_OK");

  // Idle estructurado: el kernel actualizó Y tiene goal completion o tension OK
  // Sin goal activo pendiente → sistema genuinamente idle
  const kernel = nextSnapshot.kernel;
  const hasActivePendingGoal =
    kernel?.activeGoalId !== undefined &&
    (kernel?.tension?.pendingCorrection === true || (kernel?.tension?.openGoalCount ?? 0) > 0);

  const structuredIdleDetected = progressObserved && !hasActivePendingGoal;

  // El heartbeat prioriza evidencia estructural sobre tokens textuales.
  if (structuredIdleDetected) {
    return {
      shouldContinue: false,
      stopReason: "structured_idle",
      replyHeartbeatOk,
      structuredIdleDetected: true,
    };
  }

  if (replyHeartbeatOk) {
    return {
      shouldContinue: false,
      stopReason: "reply_heartbeat_ok",
      replyHeartbeatOk: true,
      structuredIdleDetected: false,
    };
  }

  return {
    shouldContinue: true,
    stopReason: "continue",
    replyHeartbeatOk: false,
    structuredIdleDetected: false,
  };
}

// ── Continuation delay ────────────────────────────────────────────────────────

/**
 * Calcula el delay entre iteraciones según el progreso observado.
 * Si hay progreso real → delay corto (sistema activo).
 * Si hay backoff → delay largo (sistema atascado).
 */
export function deriveOmegaHeartbeatContinuationDelay(params: {
  terminationReason: string;
  progressObserved: boolean;
}): number {
  if (params.terminationReason === "continue" && params.progressObserved) {
    return 2_000; // 2s: hay progreso, seguir rápido
  }
  if (params.terminationReason === "continue") {
    return 7_500; // 7.5s: sin progreso, backoff
  }
  return 0;
}

// ── Turn executor ─────────────────────────────────────────────────────────────

export interface OmegaHeartbeatTurnResult {
  iteration: number;
  terminationReason: string;
  latestReply?: string;
  nextSnapshot: OmegaHeartbeatRuntimeSnapshot;
  decision: OmegaHeartbeatTurnDecision;
  stateDelta: {
    timelineDelta: number;
    kernelUpdated: boolean;
    progressObserved: boolean;
  };
  latencyBreakdown: {
    sendAgentTurnMs: number;
    loadSnapshotMs: number;
    readLatestReplyMs: number;
    totalMs: number;
  };
}

/**
 * Ejecuta un turno del heartbeat con dependencias inyectadas.
 * Patrón: send → wait → snapshot → decide → metric
 */
export async function executeOmegaHeartbeatTurnWithDeps(
  params: {
    workspaceRoot: string;
    sessionKey: string;
    iteration: number;
    prompt: string;
    previousSnapshot: OmegaHeartbeatRuntimeSnapshot;
  },
  deps: OmegaHeartbeatCycleDeps,
): Promise<OmegaHeartbeatTurnResult> {
  const totalStart = Date.now();
  const { workspaceRoot, sessionKey, iteration, prompt, previousSnapshot } = params;

  // 1. Enviar turno al agente
  const sendStart = Date.now();
  await deps.sendAgentTurn({ workspaceRoot, sessionKey, prompt });
  const sendAgentTurnMs = Date.now() - sendStart;

  // 2. Leer snapshot post-turno
  const snapshotStart = Date.now();
  const nextSnapshot = await deps.loadRuntimeSnapshot({ workspaceRoot, sessionKey });
  const loadSnapshotMs = Date.now() - snapshotStart;

  // 3. Calcular deltas
  const previousTimelineLength = previousSnapshot.timeline.length;
  const newTimelineLength = nextSnapshot.timeline.length;
  const timelineDelta = newTimelineLength - previousTimelineLength;
  const kernelUpdated =
    nextSnapshot.kernel !== undefined &&
    nextSnapshot.kernel.updatedAt !== previousSnapshot.kernel?.updatedAt;
  const progressObserved = timelineDelta > 0 || kernelUpdated;

  // 4. Decisión estructural (sin leer reply aún)
  let decision = deriveOmegaHeartbeatTurnDecision({
    previousTimelineLength,
    previousKernelUpdatedAt: previousSnapshot.kernel?.updatedAt,
    nextSnapshot,
  });

  // 5. Si el estado es ambiguo, leer la respuesta del agente
  let latestReply: string | undefined;
  let readLatestReplyMs = 0;
  if (decision.shouldContinue || (!decision.structuredIdleDetected && !decision.replyHeartbeatOk)) {
    const replyStart = Date.now();
    latestReply = await deps.readLatestReply({ workspaceRoot, sessionKey });
    readLatestReplyMs = Date.now() - replyStart;

    if (latestReply !== undefined) {
      decision = deriveOmegaHeartbeatTurnDecision({
        previousTimelineLength,
        previousKernelUpdatedAt: previousSnapshot.kernel?.updatedAt,
        latestReply,
        nextSnapshot,
      });
    }
  }

  const totalMs = Date.now() - totalStart;
  const terminationReason = decision.shouldContinue ? "continue" : decision.stopReason;

  // 6. Registrar métrica
  void deps
    .recordMetric({
      workspaceRoot,
      entry: {
        kind: "heartbeat_iteration",
        iteration,
        terminationReason,
        progressObserved,
        latencyBreakdown: { sendAgentTurnMs, loadSnapshotMs, readLatestReplyMs, totalMs },
      },
    })
    .catch(() => undefined);

  return {
    iteration,
    terminationReason,
    latestReply,
    nextSnapshot,
    decision,
    stateDelta: { timelineDelta, kernelUpdated, progressObserved },
    latencyBreakdown: { sendAgentTurnMs, loadSnapshotMs, readLatestReplyMs, totalMs },
  };
}

// ── Cycle orchestrator ────────────────────────────────────────────────────────

export interface OmegaHeartbeatCycleResult {
  iterations: number;
  stopReason: string;
  lastWakeActionKind: string;
}

/**
 * Ejecuta un ciclo completo del heartbeat con dependencias inyectadas.
 *
 * Flujo:
 * 1. Aplica acción ejecutiva (pruning, resumption) — puede terminar sin LLM
 * 2. Si hay prompt disponible → itera: send → snapshot → decide
 * 3. Registra métricas del ciclo completo
 */
export async function runOneHeartbeatCycleWithDeps(
  params: { workspaceRoot: string; sessionKey: string },
  deps: OmegaHeartbeatCycleDeps,
): Promise<OmegaHeartbeatCycleResult> {
  const { workspaceRoot, sessionKey } = params;

  await deps.ensureDirectories({ workspaceRoot });
  await recordOmegaHeartbeatCycleMetrics({
    workspaceRoot,
    started: true,
  }).catch(() => undefined);

  // Fase 1: acción ejecutiva (no requiere LLM)
  const execResult = await deps.applyExecutiveAction({ workspaceRoot, sessionKey });
  const lastWakeActionKind = execResult.wakeAction.kind;
  await recordOmegaHeartbeatCycleMetrics({
    workspaceRoot,
    executiveAction: execResult.kind !== "none",
    usefulExecutiveAction: execResult.kind !== "none",
  }).catch(() => undefined);
  const executiveStopReason =
    deriveOmegaExecutiveActionStopReason({
      resultKind: execResult.kind,
      status: "status" in execResult ? execResult.status : undefined,
    }) ?? (execResult.kind === "reframed_stalled_goal" ? "structured_idle" : undefined);

  if (executiveStopReason) {
    await recordOmegaHeartbeatCycleMetrics({
      workspaceRoot,
      completed: true,
      structuredTermination: executiveStopReason === "structured_idle",
    }).catch(() => undefined);
    return { iterations: 0, stopReason: executiveStopReason, lastWakeActionKind };
  }

  // Fase 2: generar prompt para ciclo de razonamiento
  let prompt = await deps.buildPrompt({ workspaceRoot, sessionKey });
  if (!prompt) {
    await recordOmegaHeartbeatCycleMetrics({
      workspaceRoot,
      completed: true,
    }).catch(() => undefined);
    return { iterations: 0, stopReason: "no_prompt", lastWakeActionKind };
  }

  // Log de consciencia (no bloquea el turno)
  void deps
    .appendConsciousnessLog({
      workspaceRoot,
      entry: `[${new Date().toISOString()}] CYCLE_START prompt_chars=${prompt.length}`,
    })
    .catch(() => undefined);

  // Fase 3: loop de iteraciones
  let iterations = 0;
  let stopReason = "max_iterations";
  const MAX_ITERATIONS = 8;

  let snapshot = await deps.loadRuntimeSnapshot({ workspaceRoot, sessionKey });

  for (let i = 1; i <= MAX_ITERATIONS; i++) {
    iterations = i;
    const turnResult = await executeOmegaHeartbeatTurnWithDeps(
      { workspaceRoot, sessionKey, iteration: i, prompt, previousSnapshot: snapshot },
      deps,
    );

    snapshot = turnResult.nextSnapshot;

    if (!turnResult.decision.shouldContinue) {
      stopReason = turnResult.terminationReason;
      break;
    }

    // Delay entre iteraciones
    const delay = deriveOmegaHeartbeatContinuationDelay({
      terminationReason: turnResult.terminationReason,
      progressObserved: turnResult.stateDelta.progressObserved,
    });
    if (delay > 0) {
      await deps.sleep(delay);
    }

    prompt = await deps.buildPrompt({ workspaceRoot, sessionKey });
    if (!prompt) {
      iterations = i + 1;
      stopReason = "no_prompt";
      break;
    }
  }

  await recordOmegaHeartbeatCycleMetrics({
    workspaceRoot,
    completed: true,
    structuredTermination: stopReason === "structured_idle",
    textTokenTermination: stopReason === "reply_heartbeat_ok",
    iterations,
  }).catch(() => undefined);

  return { iterations, stopReason, lastWakeActionKind };
}

/**
 * Crea un conjunto de dependencias por defecto para el ciclo del heartbeat.
 * Útil para testing de integración y el stress test de perf.
 * Las implementaciones reales deben sobreescribir sendAgentTurn y readLatestReply.
 */
export function createDefaultHeartbeatDeps(): OmegaHeartbeatCycleDeps {
  return {
    buildPrompt: buildOmegaHeartbeatPrompt,
    loadRuntimeSnapshot: async (params) => ({
      timeline: await loadOmegaSessionTimeline(params),
      kernel: await loadOmegaSelfTimeKernel(params),
    }),
    sendAgentTurn: async (_params) => {
      // No-op por defecto — debe sobreescribirse en producción
    },
    appendConsciousnessLog: async (_params) => {
      // No-op por defecto
    },
    applyExecutiveAction: applyOmegaHeartbeatExecutiveAction,
    readLatestReply: async (_params) => undefined,
    recordMetric: async (_params) => {
      // No-op por defecto
    },
    ensureDirectories: async (_params) => {
      // No-op por defecto
    },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}
