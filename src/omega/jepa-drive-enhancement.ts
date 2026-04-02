/**
 * src/omega/jepa-drive-enhancement.ts
 *
 * JEPA Tension Bridge Enhancement para Drives
 *
 * Cuando JEPA detecta alta frustración, puede:
 * 1. Elevar urgencia de drives existentes
 * 2. Activar drives que estarían dormidas
 * 3. Cambiar target de curiosidad si hay pattern
 */

import type { InnerDriveSignal } from "./inner-life/index.js";

export interface JepaTensionMetrics {
  frustration: number; // 0-2 (heurística: failureRate * 2)
  confidence: number; // 0-1
  surprise?: number; // 0-1 worsening vs prior recent window
  error?: string;
}

/**
 * Enhance a drive signal using JEPA tension metrics.
 *
 * Reglas de enhancement (v2 - optimized thresholds):
 * - Si frustration > 0.5: elevar urgencia (antes era 1.0, creaba dead zone)
 * - Si frustration > 1.5 y drive es idle: activar entropy_alert (exploración forzada)
 * - Removed: Low frustration reduction (was counterproductive)
 *
 * Rationale:
 * - Decision frequency increases when system struggles (frustration > 0.5)
 * - Entropy alert activates when really stuck (frustration > 1.5)
 * - No negative boost: autonomy shouldn't decrease when things work
 */
export function enhanceDriveWithJepaTension(
  driveSignal: InnerDriveSignal,
  jepaTension: JepaTensionMetrics,
): InnerDriveSignal {
  const surprise = Math.max(0, Math.min(1, jepaTension.surprise ?? 0));

  // Si hay error en JEPA, retornar señal original sin cambios
  if (jepaTension.error || jepaTension.confidence < 0.3) {
    return driveSignal;
  }

  // Caso 1: Drive idle pero JEPA detecta frustración extrema
  // Cuando frustración > 1.5 (75% failures), fuerza exploración
  if (
    driveSignal.kind === "idle" &&
    (jepaTension.frustration > 1.5 || (jepaTension.frustration > 1.0 && surprise > 0.28))
  ) {
    return {
      kind: "entropy_alert",
      silentMs: 0, // JEPA triggered, no es silencio temporal
      reason: `JEPA-EMERGENCY: frustration=${jepaTension.frustration.toFixed(2)} surprise=${surprise.toFixed(2)}`,
      urgency: Math.min(0.98, 0.58 + jepaTension.frustration * 0.12 + surprise * 0.2),
    };
  }

  // Caso 2: Drive existing pero JEPA eleva urgencia por frustración
  // Threshold lowered from 1.0 to 0.5 to capture mid-range struggles
  if (driveSignal.kind !== "idle" && (jepaTension.frustration > 0.5 || surprise > 0.22)) {
    const baseUrgency = driveSignal.urgency ?? 0.5;
    const boostAmount = Math.max(jepaTension.frustration * 0.12, surprise * 0.22);
    const newUrgency = Math.min(0.99, baseUrgency + boostAmount);

    return {
      ...driveSignal,
      urgency: newUrgency,
      reason: `${driveSignal.reason} [JEPA-ENHANCED: +${(boostAmount * 100).toFixed(0)}% surprise=${surprise.toFixed(2)}]`,
    };
  }

  // Caso 3: Idle drive con moderate frustration (0.5-1.5)
  // Don't activate entropy_alert yet, but prepare higher urgency
  if (
    driveSignal.kind === "idle" &&
    (jepaTension.frustration > 0.5 || surprise > 0.24) &&
    !(jepaTension.frustration > 1.5 || (jepaTension.frustration > 1.0 && surprise > 0.28))
  ) {
    // Slightly elevate homeostasis or curiosity instead of entropy_alert
    const nextDrive =
      jepaTension.frustration > 0.95 || surprise > 0.35 ? "curiosity" : "homeostasis";
    const urgency = 0.36 + jepaTension.frustration * 0.12 + surprise * 0.2;

    if (nextDrive === "curiosity") {
      return {
        kind: "curiosity",
        target: "memory/",
        reason: `JEPA-ENGAGED: moderate frustration=${jepaTension.frustration.toFixed(2)} surprise=${surprise.toFixed(2)}`,
        urgency: Math.min(0.84, urgency),
      };
    } else {
      return {
        kind: "homeostasis",
        reason: `JEPA-ENGAGED: moderate frustration=${jepaTension.frustration.toFixed(2)} surprise=${surprise.toFixed(2)}`,
        urgency: Math.min(0.82, urgency),
      };
    }
  }

  // Default: No change for very low frustration or non-idle drives
  return driveSignal;
}

/**
 * Metrics from JEPA predictor about frustration
 *
 * Heurística simplificada:
 * - Timeline analysis: % de fallos recientes
 * - frustration = failureRate * 2 (0-2 scale)
 * - confidence = 1 - failureRate
 *
 * Con datos reales de SKYNET_OMEGA/jepa_predictor.py:
 * - VICReg loss como proxy de "sorpresa"
 * - Embedding divergence como proxy de "incertidumbre"
 *
 * Compatible with both KernelTimelineEntry and OmegaSessionTimelineEntry:
 * - If `turn` field is missing, derives it from array index
 * - Works with any entry type that has an `outcome` field
 */
type TimelineEntryForJepa = {
  outcome?: { status: string; errorKind?: string };
  turn?: number;
};

export function parseJepaTensionFromKernelTimeline(
  timeline: TimelineEntryForJepa[],
): JepaTensionMetrics {
  if (!timeline || timeline.length < 2) {
    return { frustration: 0, confidence: 0, surprise: 0 };
  }

  const recentEntries = timeline.slice(-Math.min(5, timeline.length));
  const priorEntries = timeline.slice(
    Math.max(0, timeline.length - Math.min(10, timeline.length)),
    Math.max(0, timeline.length - Math.min(5, timeline.length)),
  );
  const failures = recentEntries.filter((e) => e.outcome?.status === "error").length;
  const failureRate = failures / recentEntries.length;
  const priorFailureRate =
    priorEntries.length === 0
      ? failureRate
      : priorEntries.filter((e) => e.outcome?.status === "error").length / priorEntries.length;

  return {
    frustration: Math.min(2, failureRate * 2),
    confidence: 1 - failureRate,
    surprise: Math.max(0, Math.min(1, failureRate - priorFailureRate)),
  };
}
