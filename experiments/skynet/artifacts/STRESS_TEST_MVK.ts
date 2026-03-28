import assert from "node:assert/strict";
import * as tf from "@tensorflow/tfjs";
import { CognitiveKernelMin, DEFAULT_CONFIG } from "./COGNITIVE_KERNEL_MIN.js";

async function runStressTest(): Promise<void> {
  console.log("🧪 Iniciando stress test del Kernel Mínimo (MVK)...");

  const kernel = new CognitiveKernelMin(DEFAULT_CONFIG);
  const anchor = tf.ones([10, 10]);

  try {
    await kernel.perceive(anchor);

    for (let i = 0; i < 60; i++) {
      const shape = i % 3 === 0 ? [10, 10] : i % 3 === 1 ? [30, 30] : [DEFAULT_CONFIG.spectralDim];
      const scale = i % 5 === 0 ? 8 : 1;
      const input = tf.randomNormal(shape as [number, number] | [number]).mul(scale);

      const state = await kernel.perceive(input);
      assert.equal(
        state.sensory.shape[0],
        DEFAULT_CONFIG.spectralDim,
        `ciclo ${i}: sensory corrupto`,
      );
      assert.equal(
        state.spectral.shape[0],
        DEFAULT_CONFIG.spectralDim,
        `ciclo ${i}: spectral corrupto`,
      );
      assert.ok(Number.isFinite(state.surprise), `ciclo ${i}: surprise no finita`);

      input.dispose();
    }

    const stats = kernel.getStats();
    assert.ok(stats.fossilCount >= 1, "el stress test debe dejar fósiles consolidados");
    assert.ok(kernel.canRecover(anchor), "el patrón ancla debe seguir recuperable");

    console.log(
      `✅ Stress test OK. Fósiles: ${stats.fossilCount}. Última sorpresa: ${stats.surprise.toFixed(4)}`,
    );
  } finally {
    anchor.dispose();
    kernel.dispose();
  }
}

runStressTest().catch((err) => {
  console.error("❌ Stress test MVK falló:", err);
  process.exitCode = 1;
});
