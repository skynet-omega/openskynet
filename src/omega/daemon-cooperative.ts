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

const INTERACTION_LOCK_FILE = ".interaction-lock";
const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutos: si TUI se cuelga, daemon sigue

/**
 * DAEMON ENTRY POINT
 * Se ejecuta una sola vez al boot/inicio
 * Luego ejecuta runAutonomousLoop() de forma coordinada
 */
export async function startAutonomousDaemon(params: { workspaceRoot: string; sessionKey: string }) {
  const lockFilePath = path.join(params.workspaceRoot, INTERACTION_LOCK_FILE);

  console.log("[DAEMON] 🚀 Iniciando OpenSkyNet Autonomous Daemon");
  console.log(`[DAEMON] Session: ${params.sessionKey}`);
  console.log(`[DAEMON] Lock file: ${lockFilePath}`);
  console.log(`[DAEMON] Presiona Ctrl+C para detener`);
  console.log("");

  /**
   * WRAPPER del loop autónomo que respeta la interacción
   */
  const wrappedLoop = async () => {
    const originalInterval = 5; // 5 minutos entre ciclos

    let cycleCount = 0;

    while (true) {
      cycleCount++;

      // CHECK: ¿Hay interacción activa?
      const isInteracting = await checkInteractionLock(lockFilePath);

      if (isInteracting) {
        console.log(`[DAEMON] 🧑 Interacción detectada. Daemon en pausa (ciclo ${cycleCount})...`);
        // Espera menos: verifica cada 10s si TUI terminó
        await sleep(10 * 1000);
        continue;
      }

      // AUTONOMÍA: Ejecuta ciclo
      console.log(`[DAEMON] 🤖 Ciclo #${cycleCount} - Daemon activo`);
      try {
        // Ejecuta ciclo real
        const { runOneHeartbeatCycle } = await import("./heartbeat.js");
        await runOneHeartbeatCycle({
          workspaceRoot: params.workspaceRoot,
          sessionKey: params.sessionKey,
        });
        console.log(`[DAEMON] ✓ Ciclo ${cycleCount} completado`);
      } catch (error) {
        console.error(`[DAEMON] ❌ Error en ciclo ${cycleCount}:`, error);
        // Continue despite errors
      }

      // Espera N minutos hasta próximo ciclo
      console.log(`[DAEMON] ⏰ Próximo ciclo en ${originalInterval} min (o si termina TUI)...`);
      await sleep(originalInterval * 60 * 1000);
    }
  };

  // Ejecuta el loop
  await wrappedLoop();
}

/**
 * Verifica si hay interacción activa (archivo lock existe)
 */
async function checkInteractionLock(lockFilePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(lockFilePath);
    const ageMs = Date.now() - stat.mtimeMs;

    // Si existe Y es reciente → hay interacción
    if (ageMs < 60 * 1000) {
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
  const lockFilePath = path.join(workspaceRoot, INTERACTION_LOCK_FILE);
  await fs.writeFile(lockFilePath, "");
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
  intervalMs = 10 * 1000,
): Promise<() => Promise<void>> {
  const lockFilePath = path.join(workspaceRoot, INTERACTION_LOCK_FILE);

  // Crea inicial
  await createInteractionLock(workspaceRoot);

  // Refresca cada N segundos
  const interval = setInterval(async () => {
    try {
      await fs.writeFile(lockFilePath, "");
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
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
