/**
 * inner-life/drives.ts
 * ====================
 * Evaluación de drives internas autónomas de OpenSkyNet.
 *
 * MODELO HOMEOSTÁTICO (v2):
 * Las drives ya no son umbrales fijos. Cada drive tiene:
 *   - setpoint: nivel de reposo "natural" de la drive (adaptable lentamente)
 *   - error:    setpoint - nivel_actual  → señal de activación
 *   - decay:    cae sin satisfacción → el drive resurge si no se atiende
 *
 * El sistema integra con WSP (World State Persistent):
 *   - Lee el estado actual de drives desde el WSP si está disponible
 *   - Aplica penalizaciones y satisfacciones que se persisten entre turnos
 *
 * La función evaluateInnerDrives() sigue siendo PURA (no toca disco).
 * La función evaluateInnerDrivesFromWSP() usa el WSP como fuente de verdad.
 *
 * Estas funciones no llaman al LLM. No tocan disco directamente.
 */

import type {
  OmegaWorldStatePersistent,
  WspDriveState,
} from "../omega-wsp.js";
import type { OmegaSelfTimeKernelState } from "../self-time-kernel.js";

// ── Tipos ─────────────────────────────────────────────────────────────────────

/**
 * Señal de drive interna.
 *
 * - `homeostasis`: tensión estructural detectada → reconciliar estado
 * - `curiosity`:   drive de curiosidad activa → explorar
 * - `entropy_alert`: drive de integridad activa → silencio peligroso
 * - `competence_drive`: drive de competencia activa → mejorar rendimiento
 * - `idle`: ninguna drive supera el umbral de activación
 */
export type InnerDriveSignal =
  | {
      kind: "homeostasis";
      reason: string;
      /** 0..1 — urgencia. Derivada del error homeostático real. */
      urgency: number;
    }
  | {
      kind: "curiosity";
      target: string;
      reason: string;
      urgency: number;
    }
  | {
      kind: "entropy_alert";
      silentMs: number;
      reason: string;
      urgency: number;
    }
  | {
      kind: "competence_drive";
      reason: string;
      urgency: number;
    }
  | {
      kind: "idle";
    };

// ── Umbral de activación ──────────────────────────────────────────────────────

/**
 * Una drive solo genera señal cuando su error supera este umbral.
 * Por debajo → el sistema está suficientemente satisfecho.
 */
const DRIVE_ACTIVATION_THRESHOLD = 0.15;

/**
 * Tiempo mínimo en ms desde última actividad antes de considerar drives de silencio.
 */
const MIN_IDLE_MS_BEFORE_DRIVE = 30 * 1000;

// ── Derivación desde WSP (fuente de verdad principal) ─────────────────────────

/**
 * Evalúa drives usando el WSP como fuente de verdad.
 * El WSP mantiene el estado real entre turnos, con decaimiento acumulado.
 *
 * Retorna la drive más urgente según su error homeostático.
 */
export function evaluateInnerDrivesFromWSP(params: {
  wsp: OmegaWorldStatePersistent;
  kernel: OmegaSelfTimeKernelState;
  nowMs?: number;
  memoryCandidates?: string[];
}): InnerDriveSignal {
  const nowMs = params.nowMs ?? Date.now();
  const { wsp, kernel, memoryCandidates = [] } = params;

  // Obtener la drive más urgente del WSP
  const activeDrives = wsp.drives
    .filter((d) => d.error > DRIVE_ACTIVATION_THRESHOLD)
    .sort((a, b) => b.error - a.error);

  if (activeDrives.length === 0) {
    return { kind: "idle" };
  }

  const topDrive = activeDrives[0];
  return driveStateToSignal(topDrive, { kernel, nowMs, memoryCandidates });
}

/**
 * Convierte un WspDriveState en una InnerDriveSignal concreta.
 */
function driveStateToSignal(
  drive: WspDriveState,
  ctx: {
    kernel: OmegaSelfTimeKernelState;
    nowMs: number;
    memoryCandidates: string[];
  },
): InnerDriveSignal {
  const urgency = Math.min(0.95, drive.error);

  switch (drive.name) {
    case "homeostasis": {
      // Derive reason from kernel tension
      const streakInfo =
        ctx.kernel.tension.failureStreak > 0
          ? `failure_streak_${ctx.kernel.tension.failureStreak}`
          : ctx.kernel.tension.staleGoalCount > 0
            ? `${ctx.kernel.tension.staleGoalCount}_stale_goals`
            : "pending_correction";
      return { kind: "homeostasis", reason: streakInfo, urgency };
    }

    case "curiosity": {
      const silentMs = ctx.nowMs - ctx.kernel.identity.lastSeenAt;
      if (silentMs < MIN_IDLE_MS_BEFORE_DRIVE) {
        return { kind: "idle" };
      }
      // Seleccionar target de memoria más antiguo sin explorar
      const recentlyTouched = new Set(
        ctx.kernel.causalGraph.files
          .filter(
            (f) =>
              typeof f.lastWriteTurn === "number" &&
              ctx.kernel.turnCount - f.lastWriteTurn < 8,
          )
          .map((f) => f.path),
      );
      const target =
        ctx.memoryCandidates.find((c) => !recentlyTouched.has(c)) ??
        ctx.kernel.goals
          .filter((g) => g.status === "completed")
          .sort((a, b) => b.updatedTurn - a.updatedTurn)[0]?.task ??
        "memory/omega-episodes";
      return {
        kind: "curiosity",
        target,
        reason: `curiosity_drive_error_${urgency.toFixed(2)}`,
        urgency,
      };
    }

    case "integrity": {
      const silentMs = ctx.nowMs - ctx.kernel.identity.lastSeenAt;
      return {
        kind: "entropy_alert",
        silentMs,
        reason: `integrity_drive_error_${urgency.toFixed(2)}`,
        urgency,
      };
    }

    case "competence": {
      return {
        kind: "competence_drive",
        reason: `competence_drive_error_${urgency.toFixed(2)}`,
        urgency,
      };
    }

    default:
      return { kind: "idle" };
  }
}

// ── Fallback: evaluación clásica sin WSP ──────────────────────────────────────

/**
 * Evaluación fallback cuando no hay WSP disponible.
 * Mantiene compatibilidad con el sistema anterior basado en umbrales.
 *
 * Orden de prioridad: homeostasis > entropy_alert > curiosity > idle
 */
export function evaluateInnerDrives(params: {
  kernel: OmegaSelfTimeKernelState;
  nowMs?: number;
  memoryCandidates?: string[];
}): InnerDriveSignal {
  const nowMs = params.nowMs ?? Date.now();
  const { kernel, memoryCandidates = [] } = params;

  const silentMs = nowMs - kernel.identity.lastSeenAt;
  if (silentMs < MIN_IDLE_MS_BEFORE_DRIVE && kernel.turnCount > 0) {
    return { kind: "idle" };
  }

  // Prioridad 1: Homeostasis — tensión sin goal activo
  if (kernel.tension.failureStreak > 0 && !kernel.activeGoalId) {
    const urgency = Math.min(0.9, 0.4 + kernel.tension.failureStreak * 0.15);
    return {
      kind: "homeostasis",
      reason: `failure_streak_${kernel.tension.failureStreak}_without_active_goal`,
      urgency,
    };
  }
  if (kernel.tension.staleGoalCount >= 3) {
    return {
      kind: "homeostasis",
      reason: `${kernel.tension.staleGoalCount}_stale_goals_accumulated`,
      urgency: 0.5,
    };
  }
  if (kernel.tension.pendingCorrection && !kernel.activeGoalId) {
    return {
      kind: "homeostasis",
      reason: "pending_correction_no_active_goal",
      urgency: 0.6,
    };
  }

  // Prioridad 2: Entropía — silencio prolongado
  const ENTROPY_SILENCE_THRESHOLD_MS = 1 * 60 * 1000;
  if (!kernel.activeGoalId && silentMs >= ENTROPY_SILENCE_THRESHOLD_MS) {
    const hoursOfSilence = silentMs / (60 * 60 * 1000);
    const urgency = Math.min(0.85, 0.5 + hoursOfSilence * 0.05);
    return {
      kind: "entropy_alert",
      silentMs,
      reason: `${Math.round(hoursOfSilence)}h_without_activity`,
      urgency,
    };
  }

  // Prioridad 3: Curiosidad — exploración epistémica
  if (!kernel.activeGoalId) {
    const CURIOSITY_THRESHOLD_TURNS = 8;
    const recentCompleted = kernel.goals.filter(
      (g) =>
        g.status === "completed" &&
        kernel.turnCount - g.updatedTurn < CURIOSITY_THRESHOLD_TURNS,
    );
    if (recentCompleted.length === 0) {
      const recentlyTouched = new Set(
        kernel.causalGraph.files
          .filter(
            (f) =>
              typeof f.lastWriteTurn === "number" &&
              kernel.turnCount - f.lastWriteTurn < CURIOSITY_THRESHOLD_TURNS,
          )
          .map((f) => f.path),
      );
      const target =
        memoryCandidates.find((c) => !recentlyTouched.has(c)) ??
        kernel.goals
          .filter((g) => g.status === "completed")
          .sort((a, b) => b.updatedTurn - a.updatedTurn)[0]?.task ??
        "memory/omega-episodes";
      return {
        kind: "curiosity",
        target,
        reason: `${CURIOSITY_THRESHOLD_TURNS}_turns_without_completed_goals`,
        urgency: 0.4,
      };
    }
  }

  return { kind: "idle" };
}

// ── Integración WSP: actualizar drives según resultado del turno ──────────────

/**
 * Aplica penalizaciones o satisfacciones al WSP según el resultado observado.
 * Llamar al final de cada turno para mantener drives calibradas.
 */
export function applyTurnOutcomeToDrives(
  wsp: OmegaWorldStatePersistent,
  outcome: { status: "ok" | "error" | "timeout"; errorKind?: string },
): OmegaWorldStatePersistent {
  if (outcome.status === "ok") {
    // Éxito: sube competencia y homeostasis, decay natural en otras
    const competenceDrive = wsp.drives.find((d) => d.name === "competence");
    const homeostasisDrive = wsp.drives.find((d) => d.name === "homeostasis");
    if (competenceDrive) {
      competenceDrive.currentLevel = Math.min(1.0, competenceDrive.currentLevel + 0.1);
      competenceDrive.error = competenceDrive.setpoint - competenceDrive.currentLevel;
      competenceDrive.lastSatisfiedAt = Date.now();
    }
    if (homeostasisDrive) {
      homeostasisDrive.currentLevel = Math.min(1.0, homeostasisDrive.currentLevel + 0.05);
      homeostasisDrive.error = homeostasisDrive.setpoint - homeostasisDrive.currentLevel;
      homeostasisDrive.lastSatisfiedAt = Date.now();
    }
  } else {
    // Fallo: penaliza competencia y homeostasis proporcionalmente
    const penalty = outcome.status === "timeout" ? 0.15 : 0.1;
    const competenceDrive = wsp.drives.find((d) => d.name === "competence");
    const homeostasisDrive = wsp.drives.find((d) => d.name === "homeostasis");
    if (competenceDrive) {
      competenceDrive.currentLevel = Math.max(0, competenceDrive.currentLevel - penalty);
      competenceDrive.error = competenceDrive.setpoint - competenceDrive.currentLevel;
    }
    if (homeostasisDrive) {
      homeostasisDrive.currentLevel = Math.max(0, homeostasisDrive.currentLevel - penalty * 1.2);
      homeostasisDrive.error = homeostasisDrive.setpoint - homeostasisDrive.currentLevel;
    }
  }

  wsp.updatedAt = Date.now();
  wsp.updateCount += 1;
  return wsp;
}
