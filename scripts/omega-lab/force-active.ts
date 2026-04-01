import fs from "node:fs/promises";
import path from "node:path";
import { runOneHeartbeatCycle } from "./heartbeat.js";

async function forceActiveCycle() {
  const workspaceRoot = process.cwd();
  const sessionKey = "agent:main:main";
  const kernelPath = path.join(
    workspaceRoot,
    ".openskynet",
    "omega-session-state",
    "agent_main_main-6d9217fe77c7.json",
  );

  console.log("🛠️ Inyectando Kernel Activo con Tensión...");

  const activeKernel = {
    revision: 2,
    sessionKey: "agent:main:main",
    turnCount: 10,
    activeGoalId: "goal-ricci-repair",
    identity: { continuityId: "main-brain", lastTask: "Repair bottlenecks" },
    world: {
      lastOutcomeStatus: "error",
      lastObservedChangedFiles: ["src/omega/ricci-stress-test.ts"],
    },
    goals: [
      {
        id: "goal-ricci-repair",
        task: "Stabilize the Ricci bottleneck in ricci-stress-test.ts",
        status: "active",
        failureCount: 3,
        successCount: 0,
        updatedTurn: 10,
        targets: ["src/omega/ricci-stress-test.ts"],
      },
    ],
    tension: { failureStreak: 3, openGoalCount: 1, pendingCorrection: true },
    causalGraph: {
      files: [{ path: "src/omega/ricci-stress-test.ts", writeCount: 0, failureCount: 5 }],
      edges: [
        {
          goalId: "goal-ricci-repair",
          filePath: "src/omega/ricci-stress-test.ts",
          relation: "goal_failed_on_file",
        },
      ],
    },
    updatedAt: Date.now(),
  };

  await fs.writeFile(kernelPath, JSON.stringify(activeKernel, null, 2));

  console.log("🚀 Despertando a Omega en modo de TRABAJO...");
  await runOneHeartbeatCycle({ workspaceRoot, sessionKey });
}

forceActiveCycle().catch(console.error);
