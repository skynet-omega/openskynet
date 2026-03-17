import fs from "node:fs/promises";
import path from "node:path";
import { decideOmegaWakeAction } from "./frontal/wake-policy.js";
import { resumeInterruptedOmegaGoal } from "./recovery-runner.js";
import {
  focusActiveOmegaGoalTargets,
  loadOmegaSelfTimeKernel,
  loadOmegaSessionTimeline,
  pruneShadowedOmegaGoals,
  pruneStaleOmegaGoals,
  pruneSupersededOmegaGoals,
} from "./session-context.js";
import { evaluateInnerDrives, buildAutonomousDirectivePrompt } from "./inner-life/index.js";
import { logJepaSample, analyzeJepaCorrelation } from "./jepa-empirical-logger.js";
import { enhanceDriveWithJepaTension, parseJepaTensionFromKernelTimeline } from "./jepa-drive-enhancement.js";
import { getContinuousThinkingEngine } from "./continuous-thinking-engine.js";
import { getEntropyMinimizationLoop } from "./entropy-minimization-loop.js";
import { getActiveLearningStrategy } from "./active-learning-strategy.js";

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
      const untestedHypotheses = hypothesesState.activeHypotheses.filter(h => !h.tested);
      
      if (untestedHypotheses.length > 0) {
        // Ejecuta un test asíncrono sobre la correlación real de frustración
        const jepaEvaluation = await analyzeJepaCorrelation(params.workspaceRoot);
        
        for (const hypothesis of untestedHypotheses.slice(0, 2)) {
          // Actualización Bayesiana informada:
          // Si hay una correlación clara detectada (>0.1 score), consideramos que la hipótesis del log fue validada
          const confirmed = jepaEvaluation.correlationScore !== null && jepaEvaluation.correlationScore > 0.1;
          const evidence = `jepa_correlation:${jepaEvaluation.correlationScore?.toFixed(2) ?? 'null'}, events:${jepaEvaluation.totalEvents}`;
          
          learningStrategy.updateHypothesis(
            hypothesis.id,
            evidence,
            confirmed
          );
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
    }
    return undefined;
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
    lines.push("Prefer silent cleanup when newer verified writes already superseded the blocked work.");
  }

  if (wakeAction.kind === "focus_active_goal_targets") {
    lines.push(`Active goal: ${wakeAction.goalTask}`);
    lines.push(`Focus only on remaining targets: ${wakeAction.goalTargets.join(" | ")}`);
    lines.push("Do not reopen already covered targets if newer verified writes already touched them.");
  }

  if (wakeAction.kind === "prune_shadowed_goals") {
    lines.push(`Shadowed goals to prune: ${wakeAction.goalTasks.join(" | ")}`);
    lines.push("Prefer the newer active subgoal when it already covers the remaining unresolved targets.");
  }

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
 * AUTONOMOUS LOOP - Ejecuta cada N minutos sin interacción humana
 * 
 * El agente PIENSA continuamente:
 * - Cada ciclo: lee su estado, evalúa drives, genera hipótesis
 * - Detecta contradicciones, resuelve automáticamente
 * - Guarda aprendizajes en memory/ para próximos ciclos
 * - No espera a que Gonzalo pregunta algo
 * 
 * @param params Configuración del workspace
 * @param intervalMinutes Intervalo entre ciclos (default: 5 min)
 */
export async function runAutonomousLoop(params: {
  workspaceRoot: string;
  sessionKey: string;
}, intervalMinutes = 5): Promise<never> {
  const intervalMs = intervalMinutes * 60 * 1000;
  let cycleCount = 0;
  
  logOmega(`🚀 INICIANDO LOOP AUTÓNOMO (cada ${intervalMinutes} min)`);
  logOmega(`Workdir: ${params.workspaceRoot}`);
  logOmega(`Session: ${params.sessionKey}`);
  
  // Loop infinito: piensa cada N minutos
  while (true) {
    cycleCount++;
    const cycleStart = Date.now();
    
    try {
      logOmega(`\\n━━━━━ CICLO #${cycleCount} INICIADO ━━━━━`);
      
      // 1. PENSAMIENTO: Genera prompt de autonomía
      const prompt = await buildOmegaHeartbeatPrompt(params);
      
      if (!prompt) {
        logOmega(`✓ No hay trabajo. Estado OK.`);
      } else {
        logOmega(`📝 Prompt generado (${prompt.length} chars)`);
        logOmega(`💬 PENSAMIENTO: ${prompt.split('\\n')[0]}`);
        
        // 2. EJECUCIÓN: Aquí iría la llamada al LLM
        // (Actualmente solo log, se integra con LLM después)
        logOmega(`⚙️  [TODO: Ejecutar con LLM]`);
      }
      
      // 3. GOBERNANZA: Ejecuta acciones que no requieren LLM
      const executiveResult = await applyOmegaHeartbeatExecutiveAction(params);
      if (executiveResult.kind !== "none") {
        logOmega(`✅ Acción ejecutada: ${executiveResult.kind}`);
      }
      
      const cycleDuration = ((Date.now() - cycleStart) / 1000).toFixed(2);
      logOmega(`✓ Ciclo completado en ${cycleDuration}s`);
      logOmega(`━━━━━ CICLO #${cycleCount} FINALIZADO ━━━━━\\n`);
      
    } catch (error) {
      logOmega(`❌ ERROR en ciclo #${cycleCount}:`);
      logOmega(`   ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // Espera N minutos hasta próximo ciclo
    logOmega(`⏰ Próximo ciclo en ${intervalMinutes} min...`);
    await sleep(intervalMs);
  }
}

/**
 * Versión rápida para testing: 1 ciclo, no loop
 */
export async function runOneHeartbeatCycle(params: {
  workspaceRoot: string;
  sessionKey: string;
}): Promise<void> {
  logOmega(`🧠 Ejecutando UN ciclo de heartbeat`);
  
  const prompt = await buildOmegaHeartbeatPrompt(params);
  if (prompt) {
    console.log("\\n=== PROMPT GENERADO ===");
    console.log(prompt);
    console.log("=== FIN PROMPT ===");
  } else {
    logOmega(`✓ Sin trabajo. Estado OK.`);
  }
  
  const executiveResult = await applyOmegaHeartbeatExecutiveAction(params);
  logOmega(`Resultado: ${executiveResult.kind}`);
}
