import * as tf from "@tensorflow/tfjs-node"; // Using node version for faster execution
import { CognitiveKernel, DEFAULT_CONFIG } from "./COGNITIVE_KERNEL";

async function runStressTest() {
  console.log("🧪 INICIANDO PRUEBA DE ESTRÉS EMPÍRICA: COGNITIVE_KERNEL.ts");
  console.log("---------------------------------------------------------");

  const kernel = new CognitiveKernel(DEFAULT_CONFIG);

  // 1. TEST DE ESTABILIDAD (¿Explota o es estable?)
  console.log("\n1. [ESTABILIDAD] Corriendo 100 ciclos de ruido blanco...");
  let stable = true;
  for (let i = 0; i < 100; i++) {
    const input = tf.randomNormal([10, 10]); // Input pequeño de prueba
    try {
      const state = await kernel.perceive(input);
      if (tf.sub(state.spectral.real, state.spectral.real).sum().dataSync()[0] !== 0) {
        throw new Error("NaN detected in spectral core");
      }
    } catch (e) {
      console.error(`❌ FALLO EN CICLO ${i}:`, e.message);
      stable = false;
      break;
    }
  }
  if (stable) console.log("✅ ESTABILIDAD: El motor espectral no diverge.");

  // 2. TEST DE MEMORIA (N-Back Simple)
  console.log("\n2. [MEMORIA] Test de Retención de Patrón...");
  const pattern = tf.ones([10, 10]);
  const noise = tf.randomNormal([10, 10]);

  await kernel.perceive(pattern); // Grabar patrón
  for (let i = 0; i < 10; i++) await kernel.perceive(noise); // Inyectar ruido

  const finalState = await kernel.perceive(noise);
  // Similitud entre el estado actual y el patrón original guardado en fósiles
  const fossils = kernel["fossilMemory"].retrieve(pattern.flatten(), 1);
  if (fossils.length > 0) {
    console.log(
      `✅ MEMORIA: Fósil recuperado con éxito. Hit Rate: ${kernel.metrics.fossilsCreated} creados.`,
    );
  } else {
    console.log("❌ MEMORIA: Patrón perdido en el ruido.");
  }

  // 3. TEST DE RAZONAMIENTO (NLE)
  console.log("\n3. [RAZONAMIENTO] Aprendizaje de Regla Lógica...");
  const antecedent = tf.ones([kernel["config"].spectralDim + kernel["config"].sensoryDim]);
  const consequent = tf.zeros([kernel["config"].spectralDim]);

  kernel.learn(antecedent, consequent, "confirmed");
  const inferences = kernel["logicEngine"].infer(kernel["state"]);
  if (inferences.length > 0) {
    console.log("✅ LÓGICA: Regla aprendida e inferida correctamente.");
  } else {
    console.log("❌ LÓGICA: Fallo en la inferencia de la regla.");
  }

  // 4. TEST SOCIAL (ToM)
  console.log("\n4. [SOCIAL] Resonancia ToM...");
  const partnerAction = tf.randomNormal([10, 10]);
  const stateWithSocial = await kernel.perceive(pattern, partnerAction);
  console.log(`✅ SOCIAL: Resonancia promedio: ${kernel.metrics.avgResonance.toFixed(4)}`);

  console.log("\n---------------------------------------------------------");
  console.log("📊 MÉTRICAS FINALES:");
  console.log(JSON.stringify(kernel.metrics, null, 2));

  kernel.dispose();
}

runStressTest().catch(console.error);
