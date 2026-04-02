import { NeuralLogicEngine } from "./src/omega/neural-logic-engine.js";

async function testReinforce() {
  const engine = new NeuralLogicEngine();

  const state = [0.5, 0.5, 0.5];
  const context = { frustration: 0.1, recentFailures: 0, successRate: 0.9 };

  console.log("--- ANTES DEL REFUERZO ---");
  let inf = engine.infer(state, context);
  console.log("Reglas activas:", inf.activeRules);
  console.log("Confianza:", inf.inferenceConfidence.toFixed(4));

  console.log("\n--- REFORZANDO REGLA 0 (Curiosidad) ---");
  // Reforzamos la regla 0 tres veces para ver el impacto acumulado
  engine.reinforceRule(0, 0.2);
  engine.reinforceRule(0, 0.2);
  engine.reinforceRule(0, 0.2);

  console.log("\n--- DESPUÉS DEL REFUERZO ---");
  inf = engine.infer(state, context);
  console.log("Reglas activas:", inf.activeRules);
  console.log("Confianza:", inf.inferenceConfidence.toFixed(4));

  if (inf.activeRules.includes(0)) {
    console.log("\nResultado: El sistema ahora confía más en la Regla #0.");
  }
}

testReinforce().catch(console.error);
