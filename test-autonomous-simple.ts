#!/usr/bin/env node

/**
 * Test simple: Verifica que el loop autónomo funciona
 * Ejecuta 1 ciclo (runOneHeartbeatCycle) sin loop infinito
 */

import { runOneHeartbeatCycle } from "../src/omega/heartbeat.js";

async function test() {
  console.log("🧪 TEST: Verificando que heartbeat funciona...\n");
  
  const workspaceRoot = process.cwd();
  const sessionKey = "openskynet";
  
  try {
    await runOneHeartbeatCycle({
      workspaceRoot,
      sessionKey,
    });
    
    console.log("\n✅ TEST PASÓ: runOneHeartbeatCycle ejecutó sin errores");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ TEST FALLÓ:");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

test();
