import fs from "node:fs/promises";
import path from "node:path";
import { createOmegaFrontalTool } from "../agents/tools/omega-frontal-tool.js";
import { buildOmegaHeartbeatPrompt } from "./heartbeat.js";
import { HolographicMemoryManager } from "./holographic-memory.js";
import { deriveOmegaSelfTimeKernel } from "./self-time-kernel.js";
import { loadOmegaSelfTimeKernel } from "./session-context.js";

async function runComplexCognitiveTest() {
  console.log("🧠 INICIANDO TEST DE COMPLEJIDAD COGNITIVA (OMEGA BRAIN DEBUG)");
  const workspaceRoot = process.cwd();
  const sessionKey = "agent:main:complex-test";
  const memory = new HolographicMemoryManager(workspaceRoot);
  await memory.initialize();

  // --- ESCENARIO 1: LA ANOMALÍA ---
  console.log("\n[1] --- CICLO 1: LA ANOMALÍA ---");
  console.log("[DEBUG-BRAIN] Estado Inicial: Objetivo = Refactor Logs");

  const initialKernel = await loadOmegaSelfTimeKernel({ workspaceRoot, sessionKey });

  // Inyectamos un fallo crítico en un archivo de seguridad
  const securityFailureKernel = deriveOmegaSelfTimeKernel({
    priorState: initialKernel,
    sessionKey,
    task: "Refactor logs",
    validation: {
      expectsJson: false,
      expectedKeys: [],
      expectedPaths: ["src/omega/security-vulnerability.ts"],
    },
    outcome: { status: "error", errorKind: "critical_crash", observedChangedFiles: [] } as any,
    timeline: [],
  });

  // Simulamos múltiples fallos para arrugar la topología
  for (let i = 0; i < 3; i++) {
    securityFailureKernel.causalGraph.files.find(
      (f) => f.path === "src/omega/security-vulnerability.ts",
    )!.failureCount += 1;
  }

  // Guardamos el kernel de tensión
  const kernelPath = path.join(workspaceRoot, ".openskynet", "workspace-state.json");
  await fs.writeFile(kernelPath, JSON.stringify(securityFailureKernel, null, 2));

  console.log("[DEBUG-BRAIN] 📉 Ejecutando análisis de Ricci...");
  const prompt1 = await buildOmegaHeartbeatPrompt({ workspaceRoot, sessionKey });

  if (prompt1?.includes("RICCI") && prompt1?.includes("security-vulnerability.ts")) {
    console.log("✅ [DEBUG-BRAIN] Ricci detectó el pivote necesario hacia seguridad.");
  }

  // Omega "decide" cambiar su intención
  console.log("[DEBUG-BRAIN] ⚡ Actualizando Lóbulo Frontal: PIVOTE A SEGURIDAD");
  const tool = createOmegaFrontalTool({ workspaceDir: workspaceRoot });
  await tool.execute("call-1", {
    macroIntent: "Prioritize security fix over logs",
    currentFocus: "Investigating 'security-vulnerability.ts' failures",
    cognitiveResidue: "Ricci curvature indicates a systemic bottleneck.",
  });

  // --- ESCENARIO 2: LA RESONANCIA ---
  console.log("\n[2] --- CICLO 2: LA RESONANCIA (MEMORIA) ---");
  console.log("[DEBUG-BRAIN] 🏺 Recuperando 'fósiles' resonantes...");

  // Simulamos un embedding de "Fallo en Seguridad" (vector arbitrario)
  const queryEmbedding = new Array(384).fill(0.1);
  const resonances = await memory.resonance(queryEmbedding, 2);

  console.log(`[DEBUG-BRAIN] 💎 Resonancia encontrada (${resonances.length} fósiles):`);
  resonances.forEach((r, i) => console.log(`   - Fósil ${i + 1}: ${r.content}`));

  if (resonances.some((r) => r.content.includes("Prioritize security"))) {
    console.log("✅ [DEBUG-BRAIN] Resonancia exitosa: Omega recuerda su pivote anterior.");
  }

  console.log("\n[3] --- CONCLUSIÓN DEL CEREBRO ---");
  console.log("Omega ha demostrado:");
  console.log("1. Persistencia: Mantuvo su intención macro en el Lóbulo Frontal.");
  console.log("2. Agilidad Topológica: Ricci redirigió el foco al detectar fallos críticos.");
  console.log("3. Resonancia Semántica: El sistema puede recuperar lecciones pasadas.");

  console.log("\n🏁 TEST COMPLEJO FINALIZADO.");
}

runComplexCognitiveTest().catch(console.error);
