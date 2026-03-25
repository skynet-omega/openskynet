/**
 * jepa-empirical-logger.ts
 * ========================
 * Recolección automática de datos para validar correlación JEPA vs tensión real.
 *
 * Este módulo corre en background, sin requerir interacción externa.
 * Guarda métricas JEPA en cada heartbeat y eventos de tensión cuando ocurren.
 *
 * Después de 24-48h de datos, se puede analizar correlación offline.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { shouldSurfaceOmegaJepaWarnings } from "./jepa-control.js";
import { runJepaTensionBridge } from "./runtime.js";
import type { OmegaSelfTimeKernelState } from "./self-time-kernel.js";

const JEPA_LOG_FILENAME = "jepa-empirical-log.jsonl";
const MAX_LOG_ENTRIES = 10000; // Rotar después de 10k entradas

export type JepaLogEntry =
  | {
      kind: "jepa_sample";
      timestamp: number;
      sessionKey: string;
      turnCount: number;
      frustration: number;
      confidence: number;
      jepaLoss?: number;
      samplesUsed?: number;
      error?: string;
    }
  | {
      kind: "tension_event";
      timestamp: number;
      sessionKey: string;
      eventType: "failure" | "correction" | "abort" | "recovery";
      failureStreak: number;
      errorKind?: string;
      description: string;
    };

function resolveJepaLogPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".openskynet", JEPA_LOG_FILENAME);
}

/**
 * Loguea una muestra JEPA en cada heartbeat.
 * Llama esto desde buildOmegaHeartbeatPrompt cuando kernel existe.
 */
export async function logJepaSample(params: {
  workspaceRoot: string;
  sessionKey: string;
  kernel: OmegaSelfTimeKernelState;
}): Promise<void> {
  let bridgeError: string | undefined;
  let jepaResult: Awaited<ReturnType<typeof runJepaTensionBridge>> | undefined;

  try {
    jepaResult = await runJepaTensionBridge(params.workspaceRoot, params.kernel);
  } catch (err) {
    // Bridge lanzó excepción inesperada — capturar para el log
    bridgeError = err instanceof Error ? err.message : String(err);
  }

  // Siempre escribir una entrada, incluso si el bridge falló.
  // El campo `error` hace visible el fallo en el log sin romper el sistema.
  const entry: JepaLogEntry = {
    kind: "jepa_sample",
    timestamp: Date.now(),
    sessionKey: params.sessionKey,
    turnCount: params.kernel.turnCount,
    frustration: jepaResult?.frustration ?? 0,
    confidence: jepaResult?.confidence ?? 0,
    jepaLoss: jepaResult?.jepa_loss,
    samplesUsed: jepaResult?.samples_used,
    error: bridgeError ?? jepaResult?.error,
  };

  try {
    await appendJepaLogEntry(params.workspaceRoot, entry);
  } catch (err) {
    // No pudimos escribir el log disco lleno, permisos, etc
    console.warn(
      `[OMEGA] Fallo interno JEPA Bridge o I/O disk: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Avisar en consola si el subproceso Python del bridge colapsó para no fallar silenciosamente
  if ((bridgeError || entry.error) && shouldSurfaceOmegaJepaWarnings()) {
    console.warn(`[OMEGA] JEPA Bridge subproceso reportó error -> ${bridgeError || entry.error}`);
  }
}

/**
 * Loguea un evento de tensión real cuando ocurre.
 * Llama esto desde recovery, abort, o cuando hay fallo verificado.
 */
export async function logTensionEvent(params: {
  workspaceRoot: string;
  sessionKey: string;
  eventType: "failure" | "correction" | "abort" | "recovery";
  kernel: OmegaSelfTimeKernelState;
  errorKind?: string;
  description: string;
}): Promise<void> {
  try {
    const entry: JepaLogEntry = {
      kind: "tension_event",
      timestamp: Date.now(),
      sessionKey: params.sessionKey,
      eventType: params.eventType,
      failureStreak: params.kernel.tension.failureStreak,
      errorKind: params.errorKind,
      description: params.description,
    };

    await appendJepaLogEntry(params.workspaceRoot, entry);
  } catch {
    // Silenciar errores
  }
}

async function appendJepaLogEntry(workspaceRoot: string, entry: JepaLogEntry): Promise<void> {
  const logPath = resolveJepaLogPath(workspaceRoot);

  // Asegurar que existe el directorio
  try {
    await fs.mkdir(path.dirname(logPath), { recursive: true });
  } catch {
    // Ya existe
  }

  // Append línea JSON
  const line = JSON.stringify(entry) + "\n";
  await fs.appendFile(logPath, line, "utf-8");

  // Rotar si es necesario (mantener últimas 10k entradas)
  await rotateJepaLogIfNeeded(logPath);
}

async function rotateJepaLogIfNeeded(logPath: string): Promise<void> {
  try {
    const stats = await fs.stat(logPath);
    // Aproximadamente 10k líneas ~ 2MB
    if (stats.size > 2 * 1024 * 1024) {
      const content = await fs.readFile(logPath, "utf-8");
      const lines = content.split("\n").filter((l) => l.trim());
      if (lines.length > MAX_LOG_ENTRIES) {
        // Mantener últimas entradas
        const keepLines = lines.slice(-MAX_LOG_ENTRIES / 2);
        await fs.writeFile(logPath, keepLines.join("\n") + "\n", "utf-8");
      }
    }
  } catch {
    // No existe o no se puede leer, ignorar
  }
}

/**
 * Analiza correlación entre frustración JEPA y eventos de tensión.
 * Ejecutar esto después de 24-48h de recolección.
 */
export async function analyzeJepaCorrelation(workspaceRoot: string): Promise<{
  totalSamples: number;
  totalEvents: number;
  avgFrustrationBeforeFailure: number | null;
  avgFrustrationNormal: number | null;
  correlationScore: number | null;
  recommendation: string;
}> {
  const logPath = resolveJepaLogPath(workspaceRoot);

  try {
    const content = await fs.readFile(logPath, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim());

    const samples: Array<{ timestamp: number; frustration: number; confidence: number }> = [];
    const events: Array<{ timestamp: number; eventType: string }> = [];

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as JepaLogEntry;
        if (entry.kind === "jepa_sample" && entry.confidence > 0.3) {
          samples.push({
            timestamp: entry.timestamp,
            frustration: entry.frustration,
            confidence: entry.confidence,
          });
        } else if (entry.kind === "tension_event") {
          events.push({
            timestamp: entry.timestamp,
            eventType: entry.eventType,
          });
        }
      } catch {
        // Línea corrupta, ignorar
      }
    }

    // Calcular frustración promedio en ventana de 5 minutos antes de cada evento
    const WINDOW_MS = 5 * 60 * 1000; // 5 minutos
    let totalFrustrationBeforeFailure = 0;
    let countBeforeFailure = 0;

    for (const event of events) {
      if (event.eventType === "failure") {
        const relevantSamples = samples.filter(
          (s) => s.timestamp >= event.timestamp - WINDOW_MS && s.timestamp < event.timestamp,
        );
        if (relevantSamples.length > 0) {
          const avgFrustration =
            relevantSamples.reduce((sum, s) => sum + s.frustration, 0) / relevantSamples.length;
          totalFrustrationBeforeFailure += avgFrustration;
          countBeforeFailure++;
        }
      }
    }

    // Frustración promedio en períodos "normales" (sin eventos cercanos)
    let totalFrustrationNormal = 0;
    let countNormal = 0;

    for (const sample of samples) {
      const hasNearbyEvent = events.some(
        (e) => Math.abs(e.timestamp - sample.timestamp) < WINDOW_MS,
      );
      if (!hasNearbyEvent) {
        totalFrustrationNormal += sample.frustration;
        countNormal++;
      }
    }

    const avgBeforeFailure =
      countBeforeFailure > 0 ? totalFrustrationBeforeFailure / countBeforeFailure : null;
    const avgNormal = countNormal > 0 ? totalFrustrationNormal / countNormal : null;

    // Score simple: diferencia normalizada
    let correlationScore: number | null = null;
    if (avgBeforeFailure !== null && avgNormal !== null && avgNormal > 0) {
      correlationScore = (avgBeforeFailure - avgNormal) / avgNormal;
    }

    // Recomendación
    let recommendation: string;
    if (correlationScore === null) {
      recommendation = "Datos insuficientes. Continuar recolección.";
    } else if (correlationScore > 0.3) {
      recommendation = "Correlación fuerte detectada. Integrar JEPA en tension-engine.";
    } else if (correlationScore > 0.1) {
      recommendation = "Correlación débil. Ajustar parámetros o considerar alternativas.";
    } else {
      recommendation = "Sin correlación significativa. Considerar podar subsistema Python.";
    }

    return {
      totalSamples: samples.length,
      totalEvents: events.length,
      avgFrustrationBeforeFailure: avgBeforeFailure,
      avgFrustrationNormal: avgNormal,
      correlationScore,
      recommendation,
    };
  } catch {
    return {
      totalSamples: 0,
      totalEvents: 0,
      avgFrustrationBeforeFailure: null,
      avgFrustrationNormal: null,
      correlationScore: null,
      recommendation:
        "No se pudo leer log. Verificar que exista .openskynet/jepa-empirical-log.jsonl",
    };
  }
}
