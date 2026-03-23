import fs from "node:fs/promises";
import path from "node:path";
import { runOneHeartbeatCycle } from "./heartbeat.js";

async function forceGpuActivity() {
  const workspaceRoot = process.cwd();
  const sessionKey = "agent:main:main";

  // 1. Encontrar el archivo de sesión real para no fallar el kernel
  const kernelDir = path.join(workspaceRoot, ".openskynet", "omega-session-state");
  const files = await fs.readdir(kernelDir);
  const targetFile = files.find((f) => f.startsWith("agent_main_main") && f.endsWith(".json"));

  if (!targetFile) {
    console.error(
      "❌ No se encontró archivo de sesión para agent_main_main. Ejecuta primero la TUI o live-validation.",
    );
    return;
  }

  const kernelPath = path.join(kernelDir, targetFile);

  console.log(`🛠️ Inyectando ESTADO DE ALTA ENTROPÍA en ${targetFile}...`);

  // Kernel con tensión real y timeline para que sea válido
  const urgentKernel = {
    revision: 2,
    sessionKey: "agent:main:main",
    turnCount: 50,
    activeGoalId: "gpu-stress-test",
    identity: { continuityId: "brain-v1", lastTask: "Initial boot" },
    world: { lastOutcomeStatus: "error", lastObservedChangedFiles: ["src/omega/heartbeat.ts"] },
    goals: [
      {
        id: "gpu-stress-test",
        task: "Analyze the mathematical stability of the continuous thought loop and the Ricci curvature implementation. This requires deep recursive reasoning.",
        status: "active",
        failureCount: 1,
        successCount: 0,
        updatedTurn: 50,
        targets: ["src/omega/graph-analytics.ts"],
      },
    ],
    tension: { failureStreak: 1, openGoalCount: 1, pendingCorrection: true },
    causalGraph: {
      files: [{ path: "src/omega/graph-analytics.ts", writeCount: 0, failureCount: 5 }],
      edges: [
        {
          goalId: "gpu-stress-test",
          filePath: "src/omega/graph-analytics.ts",
          relation: "goal_failed_on_file",
        },
      ],
    },
    updatedAt: Date.now(),
  };

  await fs.writeFile(kernelPath, JSON.stringify(urgentKernel, null, 2));

  console.log("🔥 FORZANDO LLAMADA A OLLAMA (Local GPU)...");
  console.log("Nota: Omega pensará que tiene un error crítico y usará su GPU para resolverlo.");

  await runOneHeartbeatCycle({
    workspaceRoot,
    sessionKey: "agent:main:main",
    // Forzamos el modelo local en el prompt si es necesario,
    // pero el gateway debería usar el fallback local si inyectamos tensión.
  });
}

forceGpuActivity().catch(console.error);
