import assert from "node:assert/strict";
import * as tf from "@tensorflow/tfjs";
import { CognitiveKernelMin, DEFAULT_CONFIG } from "./COGNITIVE_KERNEL_MIN.js";

async function testMVK() {
  console.log("🚀 Iniciando Test del Kernel Mínimo (MVK)...");

  const kernel = new CognitiveKernelMin(DEFAULT_CONFIG);

  try {
    // Test 1: Percepción básica con resize implícito
    console.log("1. Test de Percepción...");
    const input1 = tf.randomNormal([10, 10]);
    const state1 = await kernel.perceive(input1);
    assert.equal(
      state1.sensory.shape[0],
      DEFAULT_CONFIG.spectralDim,
      "sensory debe quedar normalizado a spectralDim",
    );
    assert.equal(
      state1.spectral.shape[0],
      DEFAULT_CONFIG.spectralDim,
      "spectral debe tener spectralDim",
    );
    console.log(`   - Estado creado. Sorpresa: ${state1.surprise.toFixed(4)}`);

    // Test 2: El path 30x30 no debe romper por padding negativo.
    console.log("2. Test de Resolución 30x30...");
    const input30 = tf.randomNormal([30, 30]);
    const state30 = await kernel.perceive(input30);
    assert.equal(
      state30.sensory.shape[0],
      DEFAULT_CONFIG.spectralDim,
      "30x30 debe reducirse sin romper la forma",
    );
    console.log(`   - Input 30x30 procesado. Sorpresa: ${state30.surprise.toFixed(4)}`);

    // Test 3: Consolidación y memoria fósil falsable.
    console.log("3. Test de Consolidación...");
    const inputHighSurprise = tf.randomNormal([10, 10]).mul(10);
    await kernel.perceive(inputHighSurprise);
    const stats = kernel.getStats();
    assert.ok(stats.fossilCount >= 1, "una sorpresa alta debe consolidar al menos un fósil");
    console.log(`   - Fósiles consolidados: ${stats.fossilCount}`);

    // Test 4: Recuperación explícita del input previo.
    console.log("4. Test de Recuperación...");
    assert.ok(kernel.canRecover(input30), "el input consolidado debe quedar recuperable");
    const stateRecovered = await kernel.perceive(input30);
    assert.equal(
      stateRecovered.sensory.shape[0],
      DEFAULT_CONFIG.spectralDim,
      "la recuperación no debe corromper la forma",
    );
    console.log(`   - Recuperación verificada. Sorpresa: ${stateRecovered.surprise.toFixed(4)}`);

    console.log("\n✅ Test MVK finalizado con éxito (invariantes base validados).");
  } finally {
    kernel.dispose();
  }
}

testMVK().catch((err) => {
  if (
    err?.message?.includes("Cannot find module '@tensorflow/tfjs'") ||
    err?.message?.includes("Cannot find package '@tensorflow/tfjs'")
  ) {
    console.log("\n⚠️  BLOQUEO: '@tensorflow/tfjs' no está instalado en el entorno.");
    console.log("Para ejecutar la Fase C, instala la dependencia:");
    console.log("pnpm add @tensorflow/tfjs");
  } else {
    console.error("❌ Error inesperado:", err);
  }
});
