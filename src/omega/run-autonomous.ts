#!/usr/bin/env node

/**
 * Entry point para ejecutar el loop autónomo
 * 
 * Uso:
 *   pnpm openclaw autonomous --interval 5  # Cada 5 minutos
 *   pnpm openclaw autonomous --once        # Solo 1 ciclo (testing)
 */

import { runAutonomousLoop, runOneHeartbeatCycle } from "./heartbeat.js";

async function main() {
  const args = process.argv.slice(2);
  const workspaceRoot = process.cwd();
  const sessionKey = "openskynet";
  
  // Parser simple de argumentos
  let intervalMinutes = 5;
  let runOnce = false;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--interval" && args[i + 1]) {
      intervalMinutes = parseInt(args[i + 1], 10);
      i++;
    }
    if (args[i] === "--once") {
      runOnce = true;
    }
    if (args[i] === "--help" || args[i] === "-h") {
      console.log(`
🤖 OpenSkyNet Autonomous Loop

Uso:
  pnpm openclaw autonomous [options]

Opciones:
  --interval N    Ejecutar loop cada N minutos (default: 5)
  --once          Ejecutar solo 1 ciclo (para testing)
  --help          Mostrar esta ayuda

Ejemplos:
  # Loop cada 5 minutos (vivo, sin tu interacción)
  pnpm openclaw autonomous

  # Loop cada 3 minutos (más activo)
  pnpm openclaw autonomous --interval 3

  # Solo 1 ciclo (testing/diagnóstico)
  pnpm openclaw autonomous --once

Estado: El agente va a:
  1. Leer su estado (kernel, memory, goals)
  2. Evaluar drives internos (curiosidad, frustración, etc)
  3. Generar hipótesis automáticamente
  4. Resolver contradicciones detectadas
  5. Guardar aprendizajes
  6. Repetir cada N minutos

Presiona Ctrl+C para terminar.
      `);
      process.exit(0);
    }
  }
  
  const params = { workspaceRoot, sessionKey };
  
  if (runOnce) {
    await runOneHeartbeatCycle(params);
  } else {
    // Loop infinito (Ctrl+C para terminar)
    await runAutonomousLoop(params, intervalMinutes);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
