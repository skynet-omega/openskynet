import { isMainModule } from "../infra/is-main.js";

// --- MOCK DE LA LÓGICA DE OMEGA ---

async function simulateOmegaStep(step: number) {
  console.log(`[SIM] 执行 (Ejecutando) Iteración ${step}...`);

  // Simulamos estados del Kernel basados en el progreso
  if (step === 1) {
    return { status: "ok", changedFiles: ["src/logic.ts"], failureStreak: 0 };
  } else if (step === 2) {
    return { status: "error", changedFiles: [], failureStreak: 1 }; // Falló, debe seguir
  } else {
    return { status: "ok", changedFiles: [], failureStreak: 0 }; // Terminó
  }
}

export async function runProofOfFlow() {
  console.log("🧪 INICIANDO PRUEBA DE LÓGICA DE CONTINUIDAD");

  let iterations = 0;
  const MAX_ITERATIONS = 5;
  let shouldContinue = true;

  // ESTA ES LA MISMA LÓGICA QUE HAY EN heartbeat.ts
  while (shouldContinue && iterations < MAX_ITERATIONS) {
    iterations++;
    console.log(`\n--- CICLO DE PENSAMIENTO #${iterations} ---`);

    // 1. Simular acción
    const result = await simulateOmegaStep(iterations);

    // 2. Lógica de decisión (Copiada de heartbeat.ts)
    // "Si hubo cambios o hay tensión acumulada, mantén el flujo"
    if (result.failureStreak > 0 || result.changedFiles.length > 0) {
      console.log(
        `✨ [LOGIC] Tensión detectada (${result.failureStreak}) o archivos cambiados. CONTINUANDO...`,
      );
      shouldContinue = true;
    } else {
      console.log(`🧘 [LOGIC] No hay más tensión. ENTRANDO EN REPOSO.`);
      shouldContinue = false;
    }

    if (shouldContinue && iterations < MAX_ITERATIONS) {
      console.log("...esperando 1s para la siguiente respiración cognitiva...");
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  if (iterations === 3 && !shouldContinue) {
    console.log("\n✅ PRUEBA EXITOSA: Omega encadenó 3 pensamientos y se detuvo solo al terminar.");
  } else {
    console.error("\n❌ PRUEBA FALLIDA: El flujo se cortó o no terminó correctamente.");
  }
}

if (isMainModule({ currentFile: import.meta.filename })) {
  runProofOfFlow().catch((error) => {
    console.error("\n❌ PRUEBA FALLIDA: excepción no controlada.", error);
    process.exitCode = 1;
  });
}
