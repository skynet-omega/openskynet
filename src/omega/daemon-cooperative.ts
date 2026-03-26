/**
 * DAEMON COOPERATIVO - Respeta interacción humana
 *
 * Sistema de "leasing":
 * - Cuando abres "openskynet tui" → crea .interaction-lock
 * - Daemon ve el lock → se pausa (no ejecuta ciclos)
 * - Cierras TUI → borra lock
 * - Daemon detecta ausencia → continúa
 *
 * Nunca bloquea interacción. El daemon cede.
 */

import fs from "node:fs/promises";
import path from "node:path";
import {
  OMEGA_DEFAULT_AUTONOMOUS_INTERVAL_MINUTES,
  OMEGA_INTERACTION_LOCK_REFRESH_MS,
  OMEGA_INTERACTION_LOCK_TIMEOUT_MS,
} from "./autonomous-runtime.js";

const INTERACTION_LOCK_FILE = ".interaction-lock";

export interface DaemonParams {
  workspaceRoot: string;
  sessionKey: string;
  signal?: AbortSignal;
}

export interface DaemonDeps {
  checkInteractionLock?: (path: string) => Promise<boolean>;
  runHeartbeatCycle?: (params: { workspaceRoot: string; sessionKey: string }) => Promise<void>;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  log?: (...args: any[]) => void;
  error?: (...args: any[]) => void;
}

type InteractionLockPayload = {
  owner: "tui";
  pid: number;
  refreshedAt: number;
};

async function writeInteractionLock(workspaceRoot: string): Promise<void> {
  const lockFilePath = path.join(workspaceRoot, INTERACTION_LOCK_FILE);
  const payload: InteractionLockPayload = {
    owner: "tui",
    pid: process.pid,
    refreshedAt: Date.now(),
  };
  await fs.writeFile(lockFilePath, JSON.stringify(payload, null, 2), "utf-8");
}

export async function startAutonomousDaemon(params: DaemonParams, deps: DaemonDeps = {}) {
  const lockFilePath = path.join(params.workspaceRoot, INTERACTION_LOCK_FILE);
  const log = deps.log ?? console.log;
  const errorLog = deps.error ?? console.error;

  log("[DAEMON] 🚀 Iniciando OpenSkyNet Autonomous Daemon");
  log(`[DAEMON] Session: ${params.sessionKey}`);
  log(`[DAEMON] Lock file: ${lockFilePath}`);
  log(`[DAEMON] Presiona Ctrl+C para detener`);
  log("");

  const wrappedLoop = async () => {
    let cycleCount = 0;

    while (!params.signal?.aborted) {
      cycleCount++;

      const isInteracting = deps.checkInteractionLock
        ? await deps.checkInteractionLock(lockFilePath)
        : await checkInteractionLock(lockFilePath);

      if (isInteracting) {
        log(`[DAEMON] 🧑 Interacción detectada. Daemon en pausa (ciclo ${cycleCount})...`);
        const sleepFn = deps.sleep ?? sleep;
        await sleepFn(OMEGA_INTERACTION_LOCK_REFRESH_MS, params.signal);
        continue;
      }

      log(`[DAEMON] 🤖 Ciclo #${cycleCount} - Daemon activo`);
      try {
        if (deps.runHeartbeatCycle) {
          await deps.runHeartbeatCycle({
            workspaceRoot: params.workspaceRoot,
            sessionKey: params.sessionKey,
          });
        } else {
          const { runOneHeartbeatCycle } = await import("./heartbeat.js");
          await runOneHeartbeatCycle({
            workspaceRoot: params.workspaceRoot,
            sessionKey: params.sessionKey,
          });
        }
        log(`[DAEMON] ✓ Ciclo ${cycleCount} completado`);
      } catch (error) {
        errorLog(`[DAEMON] ❌ Error en ciclo ${cycleCount}:`, error);
      }

      if (params.signal?.aborted) break;

      log(
        `[DAEMON] ⏰ Próximo ciclo en ${OMEGA_DEFAULT_AUTONOMOUS_INTERVAL_MINUTES} min (o si termina TUI)...`,
      );
      const sleepFn = deps.sleep ?? sleep;
      await sleepFn(OMEGA_DEFAULT_AUTONOMOUS_INTERVAL_MINUTES * 60 * 1000, params.signal);
    }
  };

  try {
    await wrappedLoop();
  } catch (error) {
    if (params.signal?.aborted) {
      log("[DAEMON] 🛑 Detenido por señal de aborto.");
    } else {
      throw error;
    }
  }
}

/**
 * Verifica si hay interacción activa (archivo lock existe)
 */
export async function checkInteractionLock(lockFilePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(lockFilePath);
    const ageMs = Date.now() - stat.mtimeMs;

    // Si existe Y es reciente → hay interacción
    if (ageMs < OMEGA_INTERACTION_LOCK_TIMEOUT_MS) {
      // menos de 1 minuto = interacción activa
      return true;
    }

    // Viejo = TUI se colgó, borralo
    await fs.unlink(lockFilePath);
    return false;
  } catch {
    // No existe = sin interacción
    return false;
  }
}

/**
 * Sincronización: TUI ABRE daemon → crea lock
 */
export async function createInteractionLock(workspaceRoot: string): Promise<void> {
  await writeInteractionLock(workspaceRoot);
  console.log("[TUI] 🔒 Lock creado - Daemon pausado");
}

/**
 * Sincronización: TUI CIERRA → borra lock
 */
export async function releaseInteractionLock(workspaceRoot: string): Promise<void> {
  const lockFilePath = path.join(workspaceRoot, INTERACTION_LOCK_FILE);
  try {
    await fs.unlink(lockFilePath);
    console.log("[TUI] 🔓 Lock liberado - Daemon reanuda");
  } catch {
    // Ya no existe, está bien
  }
}

/**
 * Helper: mantén lock actualizado cada N segundos (TUI activa)
 */
export async function refreshInteractionLock(
  workspaceRoot: string,
  intervalMs = OMEGA_INTERACTION_LOCK_REFRESH_MS,
): Promise<() => Promise<void>> {
  const lockFilePath = path.join(workspaceRoot, INTERACTION_LOCK_FILE);

  // Crea inicial
  await createInteractionLock(workspaceRoot);

  // Refresca cada N segundos
  const interval = setInterval(async () => {
    try {
      await writeInteractionLock(workspaceRoot);
    } catch {
      // Error al escribir, ignora
    }
  }, intervalMs);

  // Retorna función para limpiar
  return async () => {
    clearInterval(interval);
    await releaseInteractionLock(workspaceRoot);
  };
}

/**
 * Helper: duerme N millisegundos
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);

    const timeout = setTimeout(resolve, ms);

    if (signal) {
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timeout);
          reject(signal.reason);
        },
        { once: true },
      );
    }
  });
}
