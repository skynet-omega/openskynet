#!/usr/bin/env node

/**
 * DAEMON ENTRY POINT
 * Ejecutado por: openclaw daemon start openskynet-autonomous
 *
 * O manualmente:
 *   pnpm tsx src/omega/daemon-entry.ts
 */

import { resolveOmegaRuntimeDefaults } from "./autonomous-runtime.js";
import { startAutonomousDaemon } from "./daemon-cooperative.js";

async function main() {
  const { workspaceRoot, sessionKey } = resolveOmegaRuntimeDefaults({ cwd: process.cwd() });

  try {
    await startAutonomousDaemon({
      workspaceRoot,
      sessionKey,
    });
  } catch (error) {
    console.error("[DAEMON] Fatal error:", error);
    process.exit(1);
  }
}

main();
