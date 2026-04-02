import { NeuralLogicEngine } from "./src/omega/neural-logic-engine.js";

async function runComplexTest() {
  const engine = new NeuralLogicEngine();

  // Escenario 1: Estado base - Todo normal
  console.log("--- ESCENARIO 1: Estado Base ---");
  let state = [0.4, 0.4, 0.4]; // Neutro
  let context = { frustration: 0.1, recentFailures: 0, successRate: 0.9 };
  let inference = engine.infer(state, context);
  console.log("Reglas activas:", inference.activeRules);
  console.log("Confianza:", inference.inferenceConfidence.toFixed(3));
  console.log(
    "Estado resultante:",
    inference.stateAfter.map((v) => v.toFixed(3)),
  );

  // Escenario 2: Simulación de Frustración Crítica (Bucle de error)
  console.log("\n--- ESCENARIO 2: Frustración Crítica ---");
  state = [0.8, 0.8, 0.9]; // Estado de "estrés"
  context = { frustration: 0.95, recentFailures: 5, successRate: 0.1 };
  inference = engine.infer(state, context);
  console.log("Reglas activas:", inference.activeRules);
  console.log(
    "Delta aplicado:",
    inference.logicalDelta.map((v) => v.toFixed(3)),
  );

  // Aprendizaje en tiempo real: Penalizar si falló
  console.log("\n--- APRENDIZAJE: Penalizando regla 0 ---");
  engine.penalizeRule(0, 0.5);

  // Re-inferir con el mismo estado
  inference = engine.infer(state, context);
  console.log("Reglas activas post-penalización:", inference.activeRules);
  console.log("Nueva Confianza:", inference.inferenceConfidence.toFixed(3));
}

runComplexTest().catch(console.error);
