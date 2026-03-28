import { NeuralLogicEngine } from "../../../src/omega/neural-logic-engine.js";

/**
 * Experimento: Falsabilidad del NLE (Neural Logic Engine)
 * Objetivo: Verificar si el NLE puede "aprender" (ajustar fuerza) ante fallos repetidos
 * y si las piezas frágiles (pesos fijos, dimensiones) causan colapso.
 */

async function runNLEFalsabilityTest() {
  console.log("--- Iniciando Experimento: Falsabilidad del NLE ---");
  const nle = new NeuralLogicEngine();

  // 1. Estado inicial: Curiosidad (Regla 0)
  const curiosityState = [0.7, 0.8, 0.9];
  console.log("\n[Fase 1] Inferencia inicial con estado de Curiosidad:");
  let state = nle.infer(curiosityState, { frustration: 0.1, successRate: 1.0, recentFailures: 0 });
  console.log(nle.explain());

  const initialStrength = nle.getStats().avgStrength;

  // 2. Simulación de "Muro": Penalización por fallo continuo
  console.log("\n[Fase 2] Simulando 5 fallos consecutivos para la Regla 0:");
  for (let i = 0; i < 5; i++) {
    // Forzamos la penalización de la regla activa (ID 0 en este caso)
    nle.penalizeRule(0, 0.2);
  }

  console.log("\n[Fase 3] Inferencia después de penalización:");
  state = nle.infer(curiosityState, { frustration: 0.1, successRate: 0.2, recentFailures: 5 });
  console.log(nle.explain());

  const finalStats = nle.getStats();
  const rule0 = (nle as any).rules.get(0);

  console.log("\n--- Resultados Empíricos ---");
  console.log(`Fuerza inicial promedio: ${initialStrength.toFixed(4)}`);
  console.log(`Fuerza final Regla 0: ${rule0.strength.toFixed(4)}`);

  if (rule0.strength < 0.2) {
    console.log("✅ RESULTADO: El NLE es falsable. La regla se degradó ante el fallo.");
  } else {
    console.log("❌ RESULTADO: La regla no se degradó lo suficiente. El sistema es rígido.");
  }

  // 3. Identificación de piezas frágiles: Inferencia con ruido
  console.log("\n[Fase 4] Prueba de Fragilidad: Ruido en el estado latente:");
  const noisyState = curiosityState.map((v) => v + (Math.random() - 0.5) * 0.5);
  state = nle.infer(noisyState, { frustration: 0.8, successRate: 0.1, recentFailures: 10 });
  console.log(nle.explain());

  if (state.activeRules.length > 0) {
    console.log("✅ RESULTADO: El NLE tolera ruido moderado en el espacio latente.");
  } else {
    console.log("❌ RESULTADO: El NLE colapsó ante el ruido. El patrón es demasiado estricto.");
  }
}

runNLEFalsabilityTest().catch(console.error);
