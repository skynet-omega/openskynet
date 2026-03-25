import * as fs from "node:fs/promises";
import * as path from "node:path";
import { getActiveLearningStrategy } from "./active-learning-strategy.js";
import { runAutonomousCycle } from "./autonomous-executor.js";
import { getContinuousThinkingEngine } from "./continuous-thinking-engine.js";
import { loadOmegaDurableMemory } from "./durable-memory.js";
import {
  loadOmegaEmpiricalMetrics,
  recordOmegaBackgroundActionMetrics,
  recordOmegaHeartbeatCycleMetrics,
  recordOmegaRouteMetrics,
  recordOmegaValidationMetrics,
  resolveOmegaEmpiricalMetricsFile,
  type OmegaEmpiricalMetrics,
  type OmegaEmpiricalRoute,
} from "./empirical-metrics.js";
import { getEntropyMinimizationLoop } from "./entropy-minimization-loop.js";
import { syncOmegaExecutiveObserverState } from "./executive-state.js";
import { decideOmegaWakeAction } from "./frontal/wake-policy.js";
import { evaluateInnerDrives, buildAutonomousDirectivePrompt } from "./inner-life/index.js";
import {
  enhanceDriveWithJepaTension,
  parseJepaTensionFromKernelTimeline,
} from "./jepa-drive-enhancement.js";
import { logJepaSample, analyzeJepaCorrelation } from "./jepa-empirical-logger.js";
import {
  loadOmegaOperationalMemoryTail,
  summarizeOmegaOperationalMemory,
} from "./operational-memory.js";
import {
  loadOmegaProblemAgenda,
  syncOmegaProblemAgenda,
  deriveOmegaAgendaExecutionContract,
} from "./problem-agenda.js";
import {
  resumeInterruptedOmegaGoal,
  type OmegaAutonomousRecoveryResult,
} from "./recovery-runner.js";
import { queryScienceBase } from "./science-base-rag.js";
import {
  focusActiveOmegaGoalTargets,
  loadOmegaSelfTimeKernel,
  loadOmegaSessionTimeline,
  pruneShadowedOmegaGoals,
  pruneStaleOmegaGoals,
  pruneSupersededOmegaGoals,
  loadOmegaSessionRuntimeSnapshot,
} from "./session-context.js";
import { deriveFocusedActiveTargets } from "./session-context.js";
import { type OmegaSessionTaskFailure } from "./session-task.js";

/**
 * Recolecta candidatos de memoria para exploración por la drive de curiosidad.
 * Busca archivos en memory/ y MEMORY.md en la raíz del workspace.
 */
async function collectMemoryCandidates(workspaceRoot: string): Promise<string[]> {
  const candidates: string[] = [];

  // MEMORY.md siempre es candidato
  const memoryMdPath = path.join(workspaceRoot, "MEMORY.md");
  try {
    await fs.access(memoryMdPath);
    candidates.push("MEMORY.md");
  } catch {
    // No existe, ignorar
  }

  // Archivos en memory/
  const memoryDir = path.join(workspaceRoot, "memory");
  try {
    const entries = await fs.readdir(memoryDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        candidates.push(path.join("memory", entry.name));
      }
    }
  } catch {
    // Directorio no existe, ignorar
  }

  return candidates;
}

export type OmegaHeartbeatExecutiveResult =
  | {
      kind: "none";
      wakeAction: ReturnType<typeof decideOmegaWakeAction>;
    }
  | {
      kind: "pruned_stale_goals";
      wakeAction: ReturnType<typeof decideOmegaWakeAction>;
      prunedGoalTasks: string[];
    }
  | {
      kind: "pruned_superseded_goals";
      wakeAction: ReturnType<typeof decideOmegaWakeAction>;
      prunedGoalTasks: string[];
    }
  | {
      kind: "focused_active_goal_targets";
      wakeAction: ReturnType<typeof decideOmegaWakeAction>;
      focusedGoalTask?: string;
      focusedTargets: string[];
    }
  | {
      kind: "pruned_shadowed_goals";
      wakeAction: ReturnType<typeof decideOmegaWakeAction>;
      prunedGoalTasks: string[];
    }
  | {
      kind: "resumed_interrupted_goal";
      wakeAction: ReturnType<typeof decideOmegaWakeAction>;
      route: "omega_delegate" | "sessions_spawn";
      status: "ok" | "error" | "timeout";
      errorKind?: string;
      observedChangedFiles?: string[];
    }
  | {
      kind: "aborted_interrupted_goal";
      wakeAction: ReturnType<typeof decideOmegaWakeAction>;
      goalTask: string;
      failureStreak: number;
      errorKind?: string;
    }
  | {
      /** Goal atascado fue reencuadrado con targets residuales para evitar retry ciego. */
      kind: "reframed_stalled_goal";
      wakeAction: ReturnType<typeof decideOmegaWakeAction>;
      goalTask: string;
      focusedTargets: string[];
    };

export async function buildOmegaHeartbeatPrompt(params: {
  workspaceRoot: string;
  sessionKey: string;
}): Promise<string | undefined> {
  const kernel = await loadOmegaSelfTimeKernel(params);
  const wakeAction = decideOmegaWakeAction({ kernel });

  // Recolectar datos JEPA para análisis empírico (no bloqueante)
  if (kernel) {
    void logJepaSample({
      workspaceRoot: params.workspaceRoot,
      sessionKey: params.sessionKey,
      kernel,
    });
  }

  if (wakeAction.kind === "heartbeat_ok") {
    // PHASE 0: EXECUTIVE ARBITRATION
    // Consulta al ejecutivo si hay tareas de mantenimiento o anomalías proactivas
    const executive = await syncOmegaExecutiveObserverState(params);
    if (executive.runtime.dispatchPlan.shouldDispatchLlmTurn) {
      const plan = executive.runtime.dispatchPlan;
      const lines = [
        "[OMEGA Executive Dispatch]",
        `Action: ${plan.selectedAction}`,
        `Reason: ${plan.rationale.join(" | ")}`,
        `Selected work item: ${plan.selectedWorkItemId}`,
      ];

      if (
        plan.selectedAction === "maintain" &&
        plan.selectedWorkItemId?.startsWith("maintenance:failure:")
      ) {
        const classKey = plan.selectedWorkItemId.slice("maintenance:".length);
        const contract = deriveOmegaAgendaExecutionContract(classKey);
        lines.push("");
        lines.push("[OMEGA Initiative Contract]");
        lines.push(`Problem class: ${classKey}`);

        // Include evidence from Durable Memory if available
        const durableMemory = await loadOmegaDurableMemory(params);
        const relevantEvidence = durableMemory.find((m) => `failure:${m.errorKind}` === classKey);
        if (relevantEvidence) {
          lines.push(
            `Evidence: ${relevantEvidence.task} -> ${relevantEvidence.targets.join(", ")}`,
          );
        }

        lines.push(`Hypothesis: ${contract.hypothesis}`);
        lines.push(`Deliverable: ${contract.deliverable}`);
        lines.push(`Success criteria: ${contract.successCriteria}`);
        if (contract.experimentMode) {
          lines.push(`Experiment mode: ${contract.experimentMode}`);
        }
      }

      lines.push("");
      lines.push("If no user-facing update is needed after inspection, reply HEARTBEAT_OK.");
      return lines.join("\n");
    }

    // Sin tensión de tarea: ejecutar ciclo completo de autonomía
    if (kernel) {
      // PHASE 1: CONTINUOUS THINKING - Generar pensamientos genuinos del sistema
      const thinkingEngine = getContinuousThinkingEngine();
      const newThoughts = thinkingEngine.think(kernel);

      // PHASE 2: ENTROPY MINIMIZATION - Detectar contradicciones automáticamente
      const entropyLoop = getEntropyMinimizationLoop();
      const contradictions = entropyLoop.detectContradictions(kernel);

      // PHASE 3: ACTIVE LEARNING - Generar hipótesis cuando la entropía es alta
      const learningStrategy = getActiveLearningStrategy();
      for (const thought of newThoughts) {
        // Solo generar hipótesis si el pensamiento promete reducir entropía significativamente
        if (thought.expectedEntropyReduction > 0.15 && thought.confidence < 0.8) {
          learningStrategy.generateHypothesis({
            observation: thought.question,
            domain: thought.drive,
            priorConfidence: thought.confidence,
          });
        }
      }

      // PHASE 4: TEST HYPOTHESES - Probar hipótesis empíricamente usando JEPA Loss History
      const hypothesesState = learningStrategy.getState();
      const untestedHypotheses = hypothesesState.activeHypotheses.filter((h) => !h.tested);

      if (untestedHypotheses.length > 0) {
        // Ejecuta un test asíncrono sobre la correlación real de frustración
        const jepaEvaluation = await analyzeJepaCorrelation(params.workspaceRoot);

        for (const hypothesis of untestedHypotheses.slice(0, 2)) {
          // Actualización Bayesiana informada:
          // Si hay una correlación clara detectada (>0.1 score), consideramos que la hipótesis del log fue validada
          const confirmed =
            jepaEvaluation.correlationScore !== null && jepaEvaluation.correlationScore > 0.1;
          const evidence = `jepa_correlation:${jepaEvaluation.correlationScore?.toFixed(2) ?? "null"}, events:${jepaEvaluation.totalEvents}`;

          learningStrategy.updateHypothesis(hypothesis.id, evidence, confirmed);
        }
      }

      // PHASE 5: TRADITIONAL DRIVES - Para compatibilidad con sistema existente
      const memoryCandidates = await collectMemoryCandidates(params.workspaceRoot);
      let driveSignal = evaluateInnerDrives({ kernel, nowMs: Date.now(), memoryCandidates });

      // PLAN B: Enhance drive with JEPA tension metrics
      // Si JEPA detecta frustración, puede elevar urgencia o activar drives
      const sessionTimeline = await loadOmegaSessionTimeline(params);
      const jepaTension = parseJepaTensionFromKernelTimeline(sessionTimeline);
      driveSignal = enhanceDriveWithJepaTension(driveSignal, jepaTension);

      if (driveSignal.kind !== "idle") {
        const autonomousPrompt = buildAutonomousDirectivePrompt({ signal: driveSignal, kernel });
        if (autonomousPrompt) {
          return autonomousPrompt;
        }
      }

      // PHASE 6: INTERNAL THOUGHTS → disponibles para próximo ciclo
      // (No genera prompt en modo heartbeat_ok, pero registra para observabilidad)
      void thinkingEngine.getStats();
    }
    return undefined;
  }

  // Budget pressure: si hay ≥3 turns stalled sin progreso, diferir
  const opTailForPrompt = await loadOmegaOperationalMemoryTail(params);
  const opSummaryForPrompt = summarizeOmegaOperationalMemory(opTailForPrompt);
  if (opSummaryForPrompt.recentStalledTurns >= 3 && opSummaryForPrompt.recentResolvedTurns === 0) {
    // Deferred: no generar prompt, el sistema está bajo presión de budget
    return undefined;
  }

  // Probe experiment: failure streak elevado → proponer experimento quirúrgico
  // Se activa con ≥2 failures del mismo tipo, con o sin goal activo
  if (
    kernel &&
    (kernel.tension.failureStreak >= 2 || kernel.tension.repeatedFailureKinds.length >= 2)
  ) {
    const lines = [
      "[OMEGA Initiative Contract]",
      "The system has detected repeated failures without an active recovery goal.",
      "Run a probe_experiment: a minimal, isolated test to identify the root cause.",
      "",
      "SURGICAL EXPERIMENT CONSTRAINTS:",
      "- NO REPAIR: Do not fix the underlying issue. Only diagnose.",
      "- Scope: ≤2 files, ≤20 lines of change",
      "- Output: a falsifiable finding (success/failure with evidence)",
      `- Failure kinds observed: ${kernel.tension.repeatedFailureKinds.join(", ") || "unknown"}`,
    ];
    return lines.join("\n");
  }

  const lines = [
    "[OMEGA Wake]",
    "Use only verified session state; do not invent new tension.",
    `Wake action: ${wakeAction.kind}`,
    `Reason: ${wakeAction.reason}`,
  ];

  if (wakeAction.kind === "review_active_goal") {
    lines.push(`Active goal requiring follow-up: ${wakeAction.goalTask}`);
    lines.push("Prefer lightweight maintenance, diagnosis, or the next falsifiable step.");
  }

  if (wakeAction.kind === "resume_interrupted_goal") {
    lines.push(`Resume interrupted goal: ${wakeAction.goalTask}`);
    if (wakeAction.goalTargets.length > 0) {
      lines.push(`Remaining verified targets: ${wakeAction.goalTargets.join(" | ")}`);
    }
    if (wakeAction.errorKind) {
      lines.push(`Last verified failure: ${wakeAction.errorKind}`);
    }
    lines.push(`Preferred route: ${wakeAction.suggestedRoute}`);
    lines.push(`Failure streak: ${wakeAction.failureStreak}`);
    lines.push(
      "Resume the goal directly from persisted state. Do not ask the user to restate the task.",
    );
  }

  if (wakeAction.kind === "abort_interrupted_goal") {
    lines.push(`Abort interrupted goal: ${wakeAction.goalTask}`);
    if (wakeAction.goalTargets.length > 0) {
      lines.push(`Blocked verified targets: ${wakeAction.goalTargets.join(" | ")}`);
    }
    if (wakeAction.errorKind) {
      lines.push(`Last verified failure: ${wakeAction.errorKind}`);
    }
    lines.push(`Preferred route exhausted: ${wakeAction.suggestedRoute}`);
    lines.push(`Failure streak: ${wakeAction.failureStreak}`);
    lines.push(
      "Do not retry automatically. Escalate only if there is new evidence, a route change, or human input.",
    );
  }

  if (wakeAction.kind === "prune_stale_goals") {
    lines.push(`Stale goals to review/prune: ${wakeAction.goalTasks.join(" | ")}`);
    lines.push("Only mention stale work if it still matters operationally.");
  }

  if (wakeAction.kind === "prune_superseded_goals") {
    lines.push(`Superseded goals to prune: ${wakeAction.goalTasks.join(" | ")}`);
    lines.push(
      "Prefer silent cleanup when newer verified writes already superseded the blocked work.",
    );
  }

  if (wakeAction.kind === "focus_active_goal_targets") {
    lines.push(`Active goal: ${wakeAction.goalTask}`);
    lines.push(`Focus only on remaining targets: ${wakeAction.goalTargets.join(" | ")}`);
    lines.push(
      "Do not reopen already covered targets if newer verified writes already touched them.",
    );
  }

  if (wakeAction.kind === "prune_shadowed_goals") {
    lines.push(`Shadowed goals to prune: ${wakeAction.goalTasks.join(" | ")}`);
    lines.push(
      "Prefer the newer active subgoal when it already covers the remaining unresolved targets.",
    );
  }

  // --- RAG: Inject relevant SCIENCE_BASE.md knowledge ---
  let taskToQuery = "";
  if ("goalTask" in wakeAction) {
    taskToQuery = wakeAction.goalTask;
  } else if ("goalTasks" in wakeAction && wakeAction.goalTasks.length > 0) {
    taskToQuery = wakeAction.goalTasks[0];
  }

  if (taskToQuery) {
    const relevantRules = await queryScienceBase({
      workspaceRoot: params.workspaceRoot,
      query: taskToQuery,
      maxRules: 3,
    });
    if (relevantRules.length > 0) {
      lines.push("");
      lines.push("--- EMPIRICAL KNOWLEDGE (SCIENCE_BASE.md RAG) ---");
      lines.push("The following rules were previously learned and verified for similar tasks:");
      for (const rule of relevantRules) {
        lines.push(rule); // rule is a line from markdown
      }
      lines.push("Apply these rules if they match the current context.");
    }
  }

  lines.push("");
  lines.push("If no user-facing update is needed after inspection, reply HEARTBEAT_OK.");
  return lines.join("\n");
}

export async function applyOmegaHeartbeatExecutiveAction(params: {
  workspaceRoot: string;
  sessionKey: string;
  requesterAgentIdOverride?: string;
}): Promise<OmegaHeartbeatExecutiveResult> {
  const kernel = await loadOmegaSelfTimeKernel(params);
  const wakeAction = decideOmegaWakeAction({ kernel });

  if (wakeAction.kind === "prune_stale_goals") {
    const pruned = await pruneStaleOmegaGoals(params);
    return {
      kind: "pruned_stale_goals",
      wakeAction,
      prunedGoalTasks: pruned.prunedGoalTasks,
    };
  }

  if (wakeAction.kind === "prune_superseded_goals") {
    const pruned = await pruneSupersededOmegaGoals(params);
    return {
      kind: "pruned_superseded_goals",
      wakeAction,
      prunedGoalTasks: pruned.prunedGoalTasks,
    };
  }

  if (wakeAction.kind === "focus_active_goal_targets") {
    const focused = await focusActiveOmegaGoalTargets(params);
    return {
      kind: "focused_active_goal_targets",
      wakeAction,
      focusedGoalTask: focused.focusedGoalTask,
      focusedTargets: focused.focusedTargets,
    };
  }

  if (wakeAction.kind === "prune_shadowed_goals") {
    const pruned = await pruneShadowedOmegaGoals(params);
    return {
      kind: "pruned_shadowed_goals",
      wakeAction,
      prunedGoalTasks: pruned.prunedGoalTasks,
    };
  }

  if (wakeAction.kind === "abort_interrupted_goal") {
    return {
      kind: "aborted_interrupted_goal",
      wakeAction,
      goalTask: wakeAction.goalTask,
      failureStreak: wakeAction.failureStreak,
      errorKind: wakeAction.errorKind,
    };
  }

  if (wakeAction.kind === "resume_interrupted_goal") {
    const resumed = await resumeInterruptedOmegaGoal({
      workspaceRoot: params.workspaceRoot,
      sessionKey: params.sessionKey,
      requesterAgentIdOverride: params.requesterAgentIdOverride,
    });
    if (resumed.kind === "resumed_interrupted_goal") {
      const exec = resumed.execution;
      return {
        kind: "resumed_interrupted_goal",
        wakeAction,
        route: resumed.route,
        status: exec.ok ? "ok" : (exec as OmegaSessionTaskFailure).status,
        errorKind: exec.ok ? undefined : (exec as OmegaSessionTaskFailure).errorKind,
        observedChangedFiles: exec.observedChangedFiles,
      };
    }
  }

  // Reframe stalled goal: si hay ≥2 turns stalled y hay goal activo con targets
  // residuales, reencuadrar para evitar retry ciego
  const opTail = await loadOmegaOperationalMemoryTail(params);
  const opSummary = summarizeOmegaOperationalMemory(opTail);
  if (opSummary.recentStalledTurns >= 2 && kernel?.activeGoalId) {
    const activeGoal = kernel.goals.find(
      (g) => g.id === kernel.activeGoalId && g.status === "active",
    );
    if (activeGoal && activeGoal.targets.length > 0) {
      const focusedTargets = deriveFocusedActiveTargets(kernel);
      const residualTargets = focusedTargets.length > 0 ? focusedTargets : activeGoal.targets;
      return {
        kind: "reframed_stalled_goal",
        wakeAction,
        goalTask: activeGoal.task,
        focusedTargets: residualTargets,
      };
    }
  }

  return {
    kind: "none",
    wakeAction,
  };
}

/**
 * Helper: duerme N milisegundos
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Helper: log con timestamp
 */
function logOmega(message: string): void {
  const now = new Date().toISOString();
  console.log(`[${now}] [OMEGA LOOP] ${message}`);
}

/**
 * AUTONOMOUS LOOP — Ejecuta cada N minutos sin interacción humana.
 *
 * Cada ciclo:
 * 1. Aplica acciones de gobernanza (pruning, recovery) sin LLM
 * 2. Evalúa drives internas y ejecuta acciones concretas (explorar memoria,
 *    limpiar sesiones, proponer experimentos) sin LLM
 * 3. Genera prompt de razonamiento (disponible para el agente en su próximo turn)
 *
 * El agente pensante (LLM) no necesita estar activo para que el loop funcione:
 * runAutonomousCycle actúa directamente sobre el FS y el estado omega.
 *
 * @param params Configuración del workspace
 * @param intervalMinutes Intervalo entre ciclos (default: 5 min)
 */
export async function runAutonomousLoop(
  params: { workspaceRoot: string; sessionKey: string },
  intervalMinutes = 5,
): Promise<never> {
  const intervalMs = intervalMinutes * 60 * 1000;
  let cycleCount = 0;
  const log = (msg: string) => console.log(`[${new Date().toISOString()}] [OMEGA LOOP] ${msg}`);

  log(`🚀 LOOP AUTÓNOMO ACTIVO (cada ${intervalMinutes} min)`);
  log(`Workspace: ${params.workspaceRoot} | Session: ${params.sessionKey}`);

  // Loop infinito: actúa cada N minutos
  while (true) {
    cycleCount++;
    const cycleStart = Date.now();

    try {
      log(`\n━━━ CICLO #${cycleCount} ━━━`);

      // FASE 1: Gobernanza ejecutiva (sin LLM)
      const execResult = await applyOmegaHeartbeatExecutiveAction(params);
      if (execResult.kind !== "none") {
        log(`✅ Gobernanza: ${execResult.kind}`);
      }

      // FASE 2: Drives autónomas (sin LLM) — explora, limpia, propone
      const autonomousCycle = await runAutonomousCycle(params);
      if (autonomousCycle) {
        log(`🤖 Drive [${autonomousCycle.driveKind}]: ${JSON.stringify(autonomousCycle.action)}`);
      } else {
        log(`💤 Drives: idle`);
      }

      // FASE 3: Prompt de razonamiento (disponible para el LLM en próximo turn)
      const prompt = await buildOmegaHeartbeatPrompt(params);
      if (prompt) {
        log(`🧠 Prompt listo (${prompt.length} chars): ${prompt.split("\n")[0]}`);
      } else {
        log(`✓ Sin trabajo pendiente. Estado OK.`);
      }

      const elapsed = ((Date.now() - cycleStart) / 1000).toFixed(2);
      log(`✓ Ciclo #${cycleCount} completado en ${elapsed}s`);
    } catch (error) {
      log(
        `❌ Error en ciclo #${cycleCount}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    log(`⏰ Próximo ciclo en ${intervalMinutes} min...`);
    await sleep(intervalMs);
  }
}

/**
 * Versión rápida para testing: 1 ciclo, no loop (sin deps)
 */
export async function runOneHeartbeatCycle(params: {
  workspaceRoot: string;
  sessionKey: string;
}): Promise<void> {
  const prompt = await buildOmegaHeartbeatPrompt(params);
  const now = new Date().toISOString();
  if (prompt) {
    console.log(`[${now}] [OMEGA LOOP] 📝 Prompt generado (${prompt.length} chars)`);
  } else {
    console.log(`[${now}] [OMEGA LOOP] ✓ Sin trabajo. Estado OK.`);
  }
  const executiveResult = await applyOmegaHeartbeatExecutiveAction(params);
  console.log(`[${now}] [OMEGA LOOP] Resultado: ${executiveResult.kind}`);
}

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
  kind?: string;
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

  const structuredIdleDetected = progressObserved && !hasActivePendingGoal && !replyHeartbeatOk;

  // El heartbeat se detiene cuando:
  // 1. La respuesta del agente dice HEARTBEAT_OK
  if (replyHeartbeatOk) {
    return {
      shouldContinue: false,
      stopReason: "reply_heartbeat_ok",
      replyHeartbeatOk: true,
      structuredIdleDetected: false,
      kind: "reply_heartbeat_ok",
    };
  }

  // 2. El estado estructural ya muestra idle (kernel actualizó, sin pending)
  if (structuredIdleDetected) {
    return {
      shouldContinue: false,
      stopReason: "structured_idle",
      replyHeartbeatOk: false,
      structuredIdleDetected: true,
      kind: "structured_idle",
    };
  }

  return {
    shouldContinue: true,
    stopReason: "continue",
    replyHeartbeatOk: false,
    structuredIdleDetected: false,
    kind: "continue",
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

  void recordOmegaHeartbeatCycleMetrics({ workspaceRoot, started: true }).catch(() => undefined);

  // Fase 1: acción ejecutiva (no requiere LLM)
  const execResult = await deps.applyExecutiveAction({ workspaceRoot, sessionKey });
  const lastWakeActionKind = execResult.wakeAction.kind;

  void recordOmegaHeartbeatCycleMetrics({
    workspaceRoot,
    executiveAction: true,
    usefulExecutiveAction: execResult.kind !== "none",
  }).catch(() => undefined);

  // Terminación estructurada: executive recovery completó sin necesitar LLM
  if (
    execResult.kind === "resumed_interrupted_goal" ||
    execResult.kind === "pruned_stale_goals" ||
    execResult.kind === "pruned_superseded_goals" ||
    execResult.kind === "pruned_shadowed_goals" ||
    execResult.kind === "focused_active_goal_targets" ||
    execResult.kind === "aborted_interrupted_goal" ||
    execResult.kind === "reframed_stalled_goal"
  ) {
    void recordOmegaHeartbeatCycleMetrics({
      workspaceRoot,
      completed: true,
      structuredTermination: true,
    }).catch(() => undefined);
    return { iterations: 0, stopReason: "structured_idle", lastWakeActionKind };
  }

  // Fase 2: generar prompt para ciclo de razonamiento
  const prompt = await deps.buildPrompt({ workspaceRoot, sessionKey });
  if (!prompt) {
    void recordOmegaHeartbeatCycleMetrics({ workspaceRoot, completed: true }).catch(
      () => undefined,
    );
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
  const MAX_ITERATIONS = 2; // Reduced from 8 to prevent quota exhaustion loops

  let snapshot = await deps.loadRuntimeSnapshot({ workspaceRoot, sessionKey });
  if (!snapshot) {
    return { iterations: 0, stopReason: "snapshot_load_failure", lastWakeActionKind };
  }

  for (let i = 1; i <= MAX_ITERATIONS; i++) {
    iterations = i;
    const turnResult = await executeOmegaHeartbeatTurnWithDeps(
      { workspaceRoot, sessionKey, iteration: i, prompt, previousSnapshot: snapshot },
      deps,
    );

    const nextSnapshot = await deps.loadRuntimeSnapshot({ workspaceRoot, sessionKey });
    if (!nextSnapshot) {
      stopReason = "snapshot_load_failure";
      break;
    }
    snapshot = nextSnapshot;

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
  }

  void recordOmegaHeartbeatCycleMetrics({
    workspaceRoot,
    completed: true,
    textTokenTermination: stopReason === "reply_heartbeat_ok",
    iterations,
  }).catch(() => undefined);

  return { iterations, stopReason, lastWakeActionKind };
}

/**
 * Snapshots y utilidades para tests
 */
export function createDefaultHeartbeatDeps(
  overrides: Partial<OmegaHeartbeatCycleDeps> = {},
): OmegaHeartbeatCycleDeps {
  return {
    buildPrompt: async () => undefined,
    loadRuntimeSnapshot: async () => ({ timeline: [], kernel: undefined }),
    sendAgentTurn: async () => undefined,
    appendConsciousnessLog: async () => undefined,
    applyExecutiveAction: async () => ({
      kind: "none" as const,
      wakeAction: { kind: "heartbeat_ok" as const, reason: "none" },
    }),
    readLatestReply: async () => undefined,
    recordMetric: async () => undefined,
    ensureDirectories: async () => undefined,
    sleep: async () => undefined,
    ...overrides,
  };
}
