import fs from "node:fs/promises";
import path from "node:path";
import { createOmegaFrontalTool } from "../agents/tools/omega-frontal-tool.js";
import { buildOmegaHeartbeatPrompt } from "./heartbeat.js";
import { HolographicMemoryManager } from "./holographic-memory.js";
import { deriveOmegaSelfTimeKernel } from "./self-time-kernel.js";
import { loadOmegaSelfTimeKernel } from "./session-context.js";

async function runLiveAutonomousCycle() {
  console.log("🚀 Iniciando Ciclo Autónomo Real de Omega...");
  const workspaceRoot = process.cwd();
  const sessionKey = "agent:main:main";

  // 1. Inyectamos fallos artificiales en el kernel para que Ricci despierte
  console.log("\n[1] Inyectando Tensión Causal...");
  const kernel = await loadOmegaSelfTimeKernel({ workspaceRoot, sessionKey });

  // Simulamos 5 fallos en el archivo que acabo de crear
  const fakeOutcome = {
    status: "error",
    errorKind: "target_not_touched",
    observedChangedFiles: [],
  };
  const updatedKernel = deriveOmegaSelfTimeKernel({
    priorState: kernel,
    sessionKey,
    task: "Fix the ricci-stress-test.ts module",
    validation: {
      expectsJson: false,
      expectedKeys: [],
      expectedPaths: ["src/omega/ricci-stress-test.ts"],
    },
    outcome: fakeOutcome as any,
    timeline: [],
  });

  // Guardamos el kernel con fallos para que sea la nueva realidad de Omega
  const kernelPath = path.join(workspaceRoot, ".openskynet", "workspace-state.json");
  await fs.writeFile(kernelPath, JSON.stringify(updatedKernel, null, 2));

  // 2. Ejecutamos Heartbeat Real (Esto activa el modo Concentración si hay tensión)
  console.log("\n[2] Ejecutando Ciclo de Pensamiento Continuo...");
  const { runOneHeartbeatCycle } = await import("./heartbeat.js");

  await runOneHeartbeatCycle({
    workspaceRoot,
    sessionKey: "agent:main:main",
  });

  // 3. Verificar persistencia de auto-modificación
  console.log("\n[3] Verificando Lóbulo Frontal tras el ciclo...");
  const { FrontalLobeManager } = await import("./frontal/frontal-lobe.js");
  const lobe = new FrontalLobeManager(workspaceRoot);
  await lobe.load();
  console.log("Estado Final del Lóbulo Frontal:", lobe.getState());

  // 4. Verificar Memoria Holográfica (Fossilización)
  console.log("\n[4] Verificando Memoria Holográfica (Fossilización)...");
  const memory = new HolographicMemoryManager(workspaceRoot);
  await memory.initialize();
  const fossils = await memory.resonance(new Array(384).fill(0.1), 1);

  if (fossils.length > 0) {
    console.log("✅ Fósil encontrado en la base de datos vectorial!");
    console.log(`   Contenido: ${fossils[0].content}`);
  } else {
    console.log("❌ No se encontró el fósil esperado.");
  }
  memory.close();

  console.log("\n🏁 Ciclo de Validación Finalizado.");
}

runLiveAutonomousCycle().catch(console.error);
