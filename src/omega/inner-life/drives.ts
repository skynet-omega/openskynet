/**
 * inner-life/drives.ts
 * ====================
 * Evaluación de drives internas autónomas de OpenSkyNet.
 *
 * Estas funciones son PURAS: toman estado y retornan una señal.
 * No tienen efectos secundarios. No llaman al LLM. No tocan disco.
 *
 * Las drives determinan si el sistema debe hacer algo por iniciativa
 * propia, sin esperar input humano.
 *
 * Diseño deliberadamente minimalista: 3 drives, umbrales configurables,
 * fáciles de deshabilitar. Si no funciona empíricamente, se ajusta.
 */

import type { OmegaSelfTimeKernelState } from "../self-time-kernel.js";

// ─── Configuración ───────────────────────────────────────────────────────────

/** Umbral de turns de silencio para activar curiosidad. */
const CURIOSITY_THRESHOLD_TURNS = 8;

/**
 * Tiempo mínimo en ms desde la última actividad para activar entropía.
 * Modificado a 1 minuto para prueba empírica en TUI.
 */
const ENTROPY_SILENCE_THRESHOLD_MS = 1 * 60 * 1000;

/**
 * Inactividad mínima en ms para que valga la pena generar prompt.
 * Evita spam en sesiones activas.
 */
const MIN_IDLE_MS_BEFORE_DRIVE = 30 * 1000; // 30 segundos

// ─── Tipos ───────────────────────────────────────────────────────────────────

/**
 * Señal de drive interna.
 *
 * - `homeostasis`: el kernel registra tensión sin goal activo → reconciliar estado.
 * - `curiosity`:   muchos turns sin actividad episódica → explorar memoria/experimentos.
 * - `entropy_alert`: silencio prolongado → el sistema elige un objetivo propio.
 * - `idle`: no hay nada que hacer. No llamar al LLM.
 */
export type InnerDriveSignal =
  | {
      kind: "homeostasis";
      reason: string;
      /** 0..1 — urgencia de atención. Mayor urgencia → mayor prioridad. */
      urgency: number;
    }
  | {
      kind: "curiosity";
      /** Sugerencia de target a explorar (path relativo de memoria o topic). */
      target: string;
      reason: string;
      urgency: number;
    }
  | {
      kind: "entropy_alert";
      /** Tiempo en ms que lleva el sistema sin actividad real. */
      silentMs: number;
      reason: string;
      urgency: number;
    }
  | {
      kind: "idle";
    };

// ─── Drive 1: Homeostasis epistémica ─────────────────────────────────────────

/**
 * Detecta incoherencia entre lo que el kernel registra y lo que es esperable.
 *
 * Se activa cuando:
 * - Hay failure_streak > 0 pero no hay activeGoalId (el sistema "olvidó" que falló)
 * - Hay goals stale acumulados que nadie limpió
 * - La tensión pendingCorrection existe pero no hay goal activo que la resuelva
 */
function evaluateHomeostasis(
  kernel: OmegaSelfTimeKernelState,
): Extract<InnerDriveSignal, { kind: "homeostasis" }> | null {
  const { tension } = kernel;

  // Error sin goal activo: el sistema tiene registered failure pero nada persiguiéndolo
  if (tension.failureStreak > 0 && !kernel.activeGoalId) {
    return {
      kind: "homeostasis",
      reason: `failure_streak_${tension.failureStreak}_without_active_goal`,
      urgency: Math.min(0.9, 0.4 + tension.failureStreak * 0.15),
    };
  }

  // Muchos goals stale: el sistema tiene pendientes olvidados
  if (tension.staleGoalCount >= 3) {
    return {
      kind: "homeostasis",
      reason: `${tension.staleGoalCount}_stale_goals_accumulated`,
      urgency: 0.5,
    };
  }

  // Corrección pendiente sin goal activo
  if (tension.pendingCorrection && !kernel.activeGoalId) {
    return {
      kind: "homeostasis",
      reason: "pending_correction_no_active_goal",
      urgency: 0.6,
    };
  }

  return null;
}

// ─── Drive 2: Curiosidad dirigida ─────────────────────────────────────────────

/**
 * Detecta períodos de bajo throughput episódico.
 *
 * Se activa cuando el turnCount ha avanzado mucho pero el causal graph
 * no muestra actividad reciente (pocos archivos escritos, pocas tareas completadas).
 *
 * El "target" de curiosidad es el archivo de memoria más antiguo no referenciado
 * recientemente, o un topic derivado del historial de goals.
 */
function evaluateCuriosity(
  kernel: OmegaSelfTimeKernelState,
  nowMs: number,
  memoryCandidates: string[],
): Extract<InnerDriveSignal, { kind: "curiosity" }> | null {
  // No activar si hay un goal activo — el sistema ya tiene foco
  if (kernel.activeGoalId) {
    return null;
  }

  // Calcular "turns de silencio epistémico"
  const recentCompletedGoals = kernel.goals.filter(
    (g) => g.status === "completed" && kernel.turnCount - g.updatedTurn < CURIOSITY_THRESHOLD_TURNS,
  );

  if (recentCompletedGoals.length > 0) {
    // Hubo trabajo reciente — no hay curiosidad pendiente
    return null;
  }

  // ¿Hay archivos de memoria sin explorar?
  const recentlyTouchedPaths = new Set(
    kernel.causalGraph.files
      .filter((f) => typeof f.lastWriteTurn === "number" && kernel.turnCount - f.lastWriteTurn < CURIOSITY_THRESHOLD_TURNS)
      .map((f) => f.path),
  );

  const unexploredMemory = memoryCandidates.find(
    (candidate) => !recentlyTouchedPaths.has(candidate),
  );

  // Derivar topic de curiosidad desde el historial de goals
  const lastGoalTask = kernel.goals
    .filter((g) => g.status === "completed")
    .sort((a, b) => b.updatedTurn - a.updatedTurn)[0]?.task;

  const target = unexploredMemory ?? lastGoalTask ?? "memory/omega-episodes";

  // Solo activar si llevamos suficiente silencio
  const silentMs = nowMs - kernel.identity.lastSeenAt;
  if (silentMs < MIN_IDLE_MS_BEFORE_DRIVE) {
    return null;
  }

  return {
    kind: "curiosity",
    target,
    reason: `${CURIOSITY_THRESHOLD_TURNS}_turns_without_completed_goals`,
    urgency: 0.4,
  };
}

// ─── Drive 3: Entropía propia ─────────────────────────────────────────────────

/**
 * Detecta silencio prolongado — el sistema no ha tenido actividad real en horas.
 *
 * En ese caso, el sistema puede elegir un objetivo propio:
 * - Estudiar algo del historial que quedó pendiente
 * - Revisar el estado del proyecto SOLITONES u OpenSkyNet mismo
 * - Anotar una observación sobre su propio estado
 *
 * Este es el drive más "existencial": no es reactivo (homeostasis) ni
 * episódico (curiosidad), sino puramente endógeno.
 */
function evaluateEntropyAlert(
  kernel: OmegaSelfTimeKernelState,
  nowMs: number,
): Extract<InnerDriveSignal, { kind: "entropy_alert" }> | null {
  // No activar si hay goal activo
  if (kernel.activeGoalId) {
    return null;
  }

  const silentMs = nowMs - kernel.identity.lastSeenAt;

  if (silentMs < ENTROPY_SILENCE_THRESHOLD_MS) {
    return null;
  }

  // Urgencia proporcional al silencio, con techo
  const hoursOfSilence = silentMs / (60 * 60 * 1000);
  const urgency = Math.min(0.85, 0.5 + hoursOfSilence * 0.05);

  return {
    kind: "entropy_alert",
    silentMs,
    reason: `${Math.round(hoursOfSilence)}h_without_activity`,
    urgency,
  };
}

// ─── Evaluador principal ──────────────────────────────────────────────────────

/**
 * Evalúa el estado del kernel y retorna la drive más urgente activa.
 *
 * Orden de prioridad: homeostasis > entropy_alert > curiosity > idle
 * (La homeostasis siempre tiene precedencia porque indica incoherencia de estado.)
 */
export function evaluateInnerDrives(params: {
  kernel: OmegaSelfTimeKernelState;
  nowMs?: number;
  /** Paths a archivos de memoria disponibles para explorar. */
  memoryCandidates?: string[];
}): InnerDriveSignal {
  const nowMs = params.nowMs ?? Date.now();
  const { kernel, memoryCandidates = [] } = params;

  // No generar drives si la sesión es demasiado reciente para que valga la pena
  const silentMs = nowMs - kernel.identity.lastSeenAt;
  if (silentMs < MIN_IDLE_MS_BEFORE_DRIVE && kernel.turnCount > 0) {
    return { kind: "idle" };
  }

  // Prioridad 1: corregir incoherencias de estado
  const homeostasis = evaluateHomeostasis(kernel);
  if (homeostasis) {
    return homeostasis;
  }

  // Prioridad 2: entropía (silencio muy largo → actuar)
  const entropy = evaluateEntropyAlert(kernel, nowMs);
  if (entropy) {
    return entropy;
  }

  // Prioridad 3: curiosidad (exploración epistémica)
  const curiosity = evaluateCuriosity(kernel, nowMs, memoryCandidates);
  if (curiosity) {
    return curiosity;
  }

  return { kind: "idle" };
}
