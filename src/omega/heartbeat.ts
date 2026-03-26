import { runAutonomousCycle } from "./autonomous-executor.js";
import { recordOmegaHeartbeatCycleMetrics } from "./empirical-metrics.js";
import { getOmegaHeartbeatEngineRegistry } from "./engines/registry.js";
import {
  mergeOmegaDriveSignalWithEngineScore,
  scoreOmegaEngineSignals,
} from "./engines/score-engine-signal.js";
import {
  deriveOmegaExecutiveActionStopReason,
  deriveOmegaHeartbeatCorrectiveControl,
} from "./execution-controller.js";
import { decideOmegaWakeAction } from "./frontal/wake-policy.js";
import { buildAutonomousDirectivePrompt } from "./inner-life/index.js";
import {
  enhanceDriveWithJepaTension,
  parseJepaTensionFromKernelTimeline,
} from "./jepa-drive-enhancement.js";
import {
  loadOmegaOperationalMemoryTail,
  summarizeOmegaOperationalMemory,
} from "./operational-memory.js";
import { deriveOmegaAgendaExecutionContract } from "./problem-agenda.js";
import { resumeInterruptedOmegaGoal } from "./recovery-runner.js";
import { loadOpenSkynetOmegaRuntimeAuthority } from "./runtime-authority.js";
import { queryScienceBase } from "./science-base-rag.js";
import {
  focusActiveOmegaGoalTargets,
  loadOmegaSelfTimeKernel,
  loadOmegaSessionTimeline,
  pruneShadowedOmegaGoals,
  pruneStaleOmegaGoals,
  pruneSupersededOmegaGoals,
} from "./session-context.js";

type OmegaHeartbeatPromptWakeAction =
  | ReturnType<typeof decideOmegaWakeAction>
  | {
      kind: "maintain";
      reason: string;
      selectedWorkItemId?: string;
      selectedWorkItemDetail?: string;
      selectedAction?: string;
    };

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

async function loadOmegaHeartbeatDecisionContext(params: {
  workspaceRoot: string;
  sessionKey: string;
  kernel?: Awaited<ReturnType<typeof loadOmegaSelfTimeKernel>>;
}) {
  const authority = await loadOpenSkynetOmegaRuntimeAuthority({
    workspaceRoot: params.workspaceRoot,
    sessionKey: params.sessionKey,
    includeWorldSnapshot: "urgent_maintenance",
  });
  const decisionContext = authority.decisionContext;
  const kernel = params.kernel ?? decisionContext.kernel;
  const wakeAction = decideOmegaWakeAction({ kernel });
  const shouldDispatchPrompt = decisionContext.shouldDispatchHeartbeatPrompt;
  const effectiveWakeAction: OmegaHeartbeatPromptWakeAction =
    shouldDispatchPrompt &&
    wakeAction.kind === "heartbeat_ok" &&
    decisionContext.controllerState?.selectedWorkItem?.queueKind === "maintenance"
      ? {
          kind: "maintain",
          reason: "executive_dispatch_selected_maintenance",
          selectedWorkItemId: decisionContext.controllerState.selectedWorkItem.id,
          selectedWorkItemDetail: decisionContext.controllerState.selectedWorkItem.detail,
          selectedAction: decisionContext.controllerState.dispatchPlan.selectedAction,
        }
      : wakeAction;

  return {
    kernel,
    wakeAction,
    effectiveWakeAction,
    wsp: decisionContext.wsp,
    stateAuthority: decisionContext.stateAuthority,
    controllerState: decisionContext.controllerState,
    operationalSummary: decisionContext.operationalSummary,
    driveSignal: decisionContext.policy.driveSignal,
    driveSignalSource: decisionContext.policy.driveSignalSource,
    shouldRunAutonomy: decisionContext.policy.shouldRunAutonomy,
    shouldDispatchPrompt,
  };
}

function deriveMaintenanceContractClassKey(workItemId?: string): string | undefined {
  if (!workItemId) {
    return undefined;
  }
  if (workItemId.startsWith("maintenance:agenda:")) {
    return workItemId.slice("maintenance:agenda:".length);
  }
  if (workItemId.startsWith("maintenance:failure:")) {
    return `failure:${workItemId.slice("maintenance:failure:".length)}`;
  }
  if (workItemId.startsWith("maintenance:stalled_progress:")) {
    return "initiative:stalled_progress";
  }
  return undefined;
}

export async function buildOmegaHeartbeatPrompt(params: {
  workspaceRoot: string;
  sessionKey: string;
}): Promise<string | undefined> {
  const {
    kernel,
    wakeAction,
    effectiveWakeAction,
    controllerState,
    driveSignal: sharedDriveSignal,
    shouldDispatchPrompt,
  } = await loadOmegaHeartbeatDecisionContext(params);
  const engines = getOmegaHeartbeatEngineRegistry();

  // Recolectar datos JEPA para análisis empírico (no bloqueante)
  if (kernel) {
    void engines.jepaEmpirical.logSample({
      workspaceRoot: params.workspaceRoot,
      sessionKey: params.sessionKey,
      kernel,
    });
  }

  if (wakeAction.kind === "heartbeat_ok" && !shouldDispatchPrompt) {
    // Sin tensión de tarea: ejecutar ciclo completo de autonomía
    if (kernel) {
      const engineSignals = engines.collectKernelSignals({
        kernel,
        minEntropyReduction: 0.15,
        maxThoughtConfidence: 0.8,
      });
      const hypothesisSignals = await engines.testUntestedHypotheses({
        workspaceRoot: params.workspaceRoot,
        maxHypothesesToTest: 2,
        correlationConfirmationThreshold: 0.1,
      });
      const scoredSignals = scoreOmegaEngineSignals([
        ...engineSignals.signals,
        ...hypothesisSignals.signals,
      ]);

      // PHASE 5: TRADITIONAL DRIVES - Para compatibilidad con sistema existente
      let driveSignal = mergeOmegaDriveSignalWithEngineScore({
        baseDriveSignal: sharedDriveSignal,
        engineScore: scoredSignals,
      });

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
      void engines.continuousThinking.getStats();
    }
    return undefined;
  }

  if (!shouldDispatchPrompt) {
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
    `Wake action: ${effectiveWakeAction.kind}`,
    `Reason: ${effectiveWakeAction.reason}`,
  ];

  if (controllerState?.dispatchPlan.shouldDispatchLlmTurn && controllerState.selectedWorkItem) {
    lines.push(`Executive action: ${controllerState.dispatchPlan.selectedAction}`);
    lines.push(`Executive work item: ${controllerState.selectedWorkItem.detail}`);
  }

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
  if ("goalTask" in effectiveWakeAction) {
    taskToQuery = effectiveWakeAction.goalTask;
  } else if ("goalTasks" in effectiveWakeAction && effectiveWakeAction.goalTasks.length > 0) {
    taskToQuery = effectiveWakeAction.goalTasks[0];
  } else if ("selectedWorkItemDetail" in effectiveWakeAction) {
    taskToQuery = effectiveWakeAction.selectedWorkItemDetail ?? "";
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

  // Handle Agenda Contract (wakeAction is cast to any because 'maintain' may be injected
  // by the Cron dispatcher at runtime, even though it is not part of the static OmegaWakeAction union)
  const wakeActionAny = effectiveWakeAction as unknown as {
    kind: string;
    selectedWorkItemId?: string;
  };
  const maintenanceContractClassKey =
    wakeActionAny.kind === "maintain"
      ? deriveMaintenanceContractClassKey(wakeActionAny.selectedWorkItemId)
      : undefined;
  if (maintenanceContractClassKey) {
    const classKey = maintenanceContractClassKey;
    const contract = deriveOmegaAgendaExecutionContract(classKey);
    lines.push("");
    lines.push("[OMEGA Initiative Contract]");
    lines.push(`Problem class: ${classKey}`);
    lines.push(`Hypothesis: ${contract.hypothesis}`);
    lines.push(`Deliverable: ${contract.deliverable}`);
    lines.push(`Success criteria: ${contract.successCriteria}`);
    if (contract.experimentMode === "probe_experiment") {
      lines.push("Experiment mode: probe_experiment (Isolated diagnosis)");
    }
    const evidence = controllerState?.worldSnapshot?.relevantMemories.find((entry) =>
      classKey.startsWith("failure:")
        ? entry.errorKind === classKey.slice("failure:".length)
        : true,
    );
    if (evidence) {
      lines.push(`Evidence task: ${evidence.task}`);
      if (evidence.targets.length > 0) {
        lines.push(`Evidence targets: ${evidence.targets.join(" | ")}`);
      }
      if (evidence.observedChangedFiles.length > 0) {
        lines.push(`Evidence writes: ${evidence.observedChangedFiles.join(" | ")}`);
      }
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
  const { kernel, wakeAction, operationalSummary } =
    await loadOmegaHeartbeatDecisionContext(params);
  const correctiveControl = deriveOmegaHeartbeatCorrectiveControl({
    wakeAction,
    operationalSummary,
  });

  if (correctiveControl.kind === "prune_stale_goals") {
    const pruned = await pruneStaleOmegaGoals(params);
    return {
      kind: "pruned_stale_goals",
      wakeAction,
      prunedGoalTasks: pruned.prunedGoalTasks,
    };
  }

  if (correctiveControl.kind === "prune_superseded_goals") {
    const pruned = await pruneSupersededOmegaGoals(params);
    return {
      kind: "pruned_superseded_goals",
      wakeAction,
      prunedGoalTasks: pruned.prunedGoalTasks,
    };
  }

  if (correctiveControl.kind === "focus_active_goal_targets") {
    const focused = await focusActiveOmegaGoalTargets(params);
    return {
      kind: "focused_active_goal_targets",
      wakeAction,
      focusedGoalTask: focused.focusedGoalTask,
      focusedTargets: focused.focusedTargets,
    };
  }

  if (correctiveControl.kind === "prune_shadowed_goals") {
    const pruned = await pruneShadowedOmegaGoals(params);
    return {
      kind: "pruned_shadowed_goals",
      wakeAction,
      prunedGoalTasks: pruned.prunedGoalTasks,
    };
  }

  if (correctiveControl.kind === "abort_interrupted_goal") {
    return {
      kind: "aborted_interrupted_goal",
      wakeAction: correctiveControl.wakeAction,
      goalTask: correctiveControl.wakeAction.goalTask,
      failureStreak: correctiveControl.wakeAction.failureStreak,
      errorKind: correctiveControl.wakeAction.errorKind,
    };
  }

  if (correctiveControl.kind === "resume_interrupted_goal") {
    const resumed = await resumeInterruptedOmegaGoal({
      workspaceRoot: params.workspaceRoot,
      sessionKey: params.sessionKey,
      requesterAgentIdOverride: params.requesterAgentIdOverride,
    });
    if (resumed.kind === "resumed_interrupted_goal") {
      return {
        kind: "resumed_interrupted_goal",
        wakeAction,
        route: resumed.route,
        status: resumed.execution.ok ? "ok" : resumed.execution.status,
        errorKind: resumed.execution.ok ? undefined : resumed.execution.errorKind,
        observedChangedFiles: resumed.execution.observedChangedFiles,
      };
    }
  }

  if (correctiveControl.kind === "reframe_stalled_goal" && kernel?.activeGoalId) {
    const activeGoal = kernel.goals.find(
      (g) => g.id === kernel.activeGoalId && g.status === "active",
    );
    if (activeGoal && activeGoal.targets.length > 0) {
      const focused = await focusActiveOmegaGoalTargets({
        ...params,
        learnedConstraints: ["reframe_before_retry", "narrow_to_unresolved_targets"],
      });
      const residualTargets =
        focused.focusedTargets.length > 0 ? focused.focusedTargets : activeGoal.targets;
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
