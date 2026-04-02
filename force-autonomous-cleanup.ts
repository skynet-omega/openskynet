import { executeAutonomousAction } from "./src/omega/autonomous-executor.js";
import { resolveOmegaRuntimeDefaults } from "./src/omega/autonomous-runtime.js";

async function forceCleanup() {
  const { workspaceRoot, sessionKey } = resolveOmegaRuntimeDefaults();

  console.log(`[FORCE] Iniciando ciclo de limpieza autónomo en ${workspaceRoot}...`);

  const result = await executeAutonomousAction({
    workspaceRoot,
    sessionKey,
    signal: {
      kind: "homeostasis",
      reason: "manual_force_cleanup_request",
      urgency: 1.0,
    },
    kernel: {
      identity: { continuityId: "manual-" + Date.now() },
      turnCount: 0,
      tension: { openGoalCount: 0, failureStreak: 0, repeatedFailureKinds: [] },
      world: { lastOutcomeStatus: "nominal", lastObservedChangedFiles: [] },
      goals: [],
    } as any,
  });

  console.log("\n[RESULTADO]:", JSON.stringify(result, null, 2));
}

forceCleanup().catch(console.error);
