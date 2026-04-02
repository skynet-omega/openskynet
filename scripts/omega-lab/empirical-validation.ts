import fs from "node:fs/promises";
import path from "node:path";
import { createOmegaFrontalTool } from "../agents/tools/omega-frontal-tool.js";
import { RicciGraphAnalytics } from "./graph-analytics.js";

async function testEmpiricalThoughtArchitecture() {
  console.log("🧪 Iniciando Prueba Empírica de Arquitectura de Pensamiento Continuo...");
  const workspaceRoot = process.cwd();
  const stateDir = path.join(workspaceRoot, ".openskynet");

  // 1. Probar Ricci Graph Analytics (Detección de Cuellos de Botella)
  console.log("\n--- Paso 1: Ricci Graph Analytics ---");
  const mockKernel: any = {
    causalGraph: {
      files: [
        { path: "src/critical-bug.ts", writeCount: 1, failureCount: 10 },
        { path: "src/stable-module.ts", writeCount: 50, failureCount: 0 },
      ],
      edges: [
        { filePath: "src/critical-bug.ts", goalId: "goal-1" },
        { filePath: "src/critical-bug.ts", goalId: "goal-2" },
      ],
    },
  };

  const analysis = RicciGraphAnalytics.analyze(mockKernel);
  console.log("Análisis de Curvatura:");
  analysis.forEach((n) =>
    console.log(
      `  - ${n.path}: Curvatura=${n.curvature.toFixed(2)}, Centralidad=${n.centrality.toFixed(2)}`,
    ),
  );

  const focus = RicciGraphAnalytics.getFocusRecommendation(mockKernel);
  if (focus && focus.includes("critical-bug.ts")) {
    console.log("✅ Ricci detectó correctamente el cuello de botella.");
  } else {
    console.error("❌ Ricci falló en detectar el cuello de botella.");
  }

  // 2. Probar Lóbulo Frontal (Persistencia de Intención)
  console.log("\n--- Paso 2: Lóbulo Frontal Tool ---");
  const tool = createOmegaFrontalTool({ workspaceDir: workspaceRoot });

  const testIntent = "Empirical validation of continuous thought";
  const result = await tool.execute("test-call-id", {
    macroIntent: testIntent,
    currentFocus: "Testing the update_frontal_lobe tool",
    cognitiveResidue: "Does it persist between calls?",
  });

  const firstContent = result.content[0];
  if (!firstContent || firstContent.type !== "text") {
    throw new Error("Expected text content");
  }
  const parsedResult = JSON.parse(firstContent.text);
  if (parsedResult.success && parsedResult.updatedState.macroIntent === testIntent) {
    console.log("✅ Herramienta update_frontal_lobe funcionó correctamente.");
  } else {
    console.error("❌ Fallo al actualizar el Lóbulo Frontal.");
  }

  // 3. Verificar persistencia en disco
  const lobeFile = path.join(stateDir, "frontal-lobe.json");
  const data = JSON.parse(await fs.readFile(lobeFile, "utf-8"));
  if (data.macroIntent === testIntent) {
    console.log("✅ Persistencia física verificada en frontal-lobe.json.");
  } else {
    console.error("❌ La persistencia física falló.");
  }

  console.log("\n🏁 Prueba Empírica Finalizada.");
}

testEmpiricalThoughtArchitecture().catch(console.error);
