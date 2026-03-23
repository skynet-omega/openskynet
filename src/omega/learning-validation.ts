import fs from "node:fs/promises";
import path from "node:path";
import { buildOmegaHeartbeatPrompt } from "./heartbeat.js";
import { deriveOmegaSelfTimeKernel } from "./self-time-kernel.js";
import { loadOmegaSelfTimeKernel } from "./session-context.js";

async function testLearningConsolidation() {
  console.log("📚 INICIANDO TEST DE CONSOLIDACIÓN DE APRENDIZAJE (PHASE 4 - REINTENTO)");
  const workspaceRoot = process.cwd();
  // Usamos una sesión real que ya tiene kernel
  const sessionKey = "main";

  // 1. Cargar el kernel real
  console.log("\n[1] Cargando kernel real...");
  const initialKernel = await loadOmegaSelfTimeKernel({ workspaceRoot, sessionKey });

  if (!initialKernel) {
    throw new Error(
      "No se pudo cargar un kernel real. Asegúrate de que .openskynet/omega-session-state/main-*.json existe.",
    );
  }

  // 2. Simular un ÉXITO en una tarea nueva sobre este kernel
  const successKernel = deriveOmegaSelfTimeKernel({
    priorState: initialKernel,
    sessionKey,
    task: "Optimize database queries",
    validation: { expectsJson: false, expectedKeys: [], expectedPaths: ["src/db.ts"] },
    outcome: { status: "ok", observedChangedFiles: ["src/db.ts"] } as any,
    timeline: [],
  });

  // Guardamos el kernel de éxito en la ruta de sesión real para que heartbeat lo lea
  const kernelDir = path.join(workspaceRoot, ".openskynet", "omega-session-state");
  const files = await fs.readdir(kernelDir);
  const mainKernelFile = files.find((f) => f.startsWith("main-") && f.endsWith(".json"));

  if (mainKernelFile) {
    const kernelPath = path.join(kernelDir, mainKernelFile);
    await fs.writeFile(kernelPath, JSON.stringify(successKernel, null, 2));
    console.log(`✅ Kernel inyectado en: ${mainKernelFile}`);
  }

  // 3. Ejecutar Heartbeat para que sintetice la regla
  console.log("\n[2] Ejecutando Heartbeat para síntesis de reglas...");
  const prompt = await buildOmegaHeartbeatPrompt({ workspaceRoot, sessionKey });

  // 4. Verificar si la regla aparece en el prompt
  console.log("\n--- ANÁLISIS DEL PROMPT ---");
  if (prompt?.includes("REGLAS COGNITIVAS") || prompt?.includes("APRENDIZAJE")) {
    console.log("✅ ÉXITO: El sistema sintetizó e inyectó la regla de aprendizaje.");

    const rulesFile = path.join(workspaceRoot, ".openskynet", "cognitive-rules.json");
    const rules = JSON.parse(await fs.readFile(rulesFile, "utf-8"));
    console.log(`✅ Reglas en disco: ${rules.length}`);
    if (rules.length > 0) {
      console.log(
        `   Última regla: ${rules[rules.length - 1].pattern} -> ${rules[rules.length - 1].action}`,
      );
    }
  } else {
    console.error("❌ FALLO: La regla no fue sintetizada o inyectada.");
    console.log("Muestra del Prompt:", prompt?.slice(0, 500));
  }

  console.log("\n🏁 TEST DE APRENDIZAJE FINALIZADO.");
}

testLearningConsolidation().catch(console.error);
