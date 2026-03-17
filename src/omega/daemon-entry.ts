#!/usr/bin/env node

/**
 * DAEMON ENTRY POINT
 * Ejecutado por: openclaw daemon start openskynet-autonomous
 *
 * O manualmente:
 *   pnpm tsx src/omega/daemon-entry.ts
 */

import { startAutonomousDaemon } from "./daemon-cooperative.js";

async function main() {
  const workspaceRoot = process.env.WORKSPACE_ROOT || process.cwd();
  const sessionKey = process.env.SESSION_KEY || "openskynet";

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
