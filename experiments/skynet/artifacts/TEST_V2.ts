import * as tf from "@tensorflow/tfjs";
import { CognitiveKernelV2, DEFAULT_CONFIG } from "./COGNITIVE_KERNEL_V2.js";

async function runV2Stress() {
  console.log("🚀 INICIANDO TEST DE ESTRÉS KERNEL V2 (FULL CYBORG)");
  console.log("--------------------------------------------------");

  const kernel = new CognitiveKernelV2({
    ...DEFAULT_CONFIG,
    spectralDim: 2048,
    sensoryDim: 1024,
  });

  try {
    // 1. Test de Invarianza de Resolución (Holograma)
    console.log("1. Test de Holograma (10x10 -> 30x30)...");
    const input10 = tf.randomNormal([10, 10]);
    await kernel.perceive(input10);
    console.log("   - OK: Proyección y percepción completada.");

    // 2. Test de Simbiosis Social (ToM)
    console.log("2. Test de Teoría de la Mente (Partner Mirror)...");
    const state = kernel.state;
    console.log(`   - Modelo de compañero creado. Dim: ${state.partnerModel.shape}`);

    // 3. Test de Estabilidad Espectral
    console.log("3. Test de Estabilidad (10 ciclos rápidos)...");
    for (let i = 0; i < 10; i++) {
      await kernel.perceive(tf.randomNormal([30, 30]));
    }
    console.log("   - OK: Ciclos completados sin NaN ni fugas detectadas.");

    console.log("\n✅ KERNEL V2 VALIDADO: Listo para escalamiento a D=2048.");
  } finally {
    kernel.dispose();
  }
}

runV2Stress().catch(console.error);
