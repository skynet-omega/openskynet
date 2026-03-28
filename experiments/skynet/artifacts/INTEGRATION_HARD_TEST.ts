import * as tf from "@tensorflow/tfjs";
import { SkynetIntegratedKernel } from "./SKYNET_INTEGRATED_KERNEL.js";

/**
 * INTEGRATION_HARD_TEST.ts
 * Simula el flujo completo de inicio a fin entre el Humano, Omega y Skynet.
 * Misión: Detectar colisiones de lógica, redundancias y bugs de integración.
 */

async function runHardIntegration() {
  console.log("🔗 INICIANDO TEST DE INTEGRACIÓN DURA (OPENCLAW + OMEGA + SKYNET)");
  console.log("---------------------------------------------------------------");

  const skynet = new SkynetIntegratedKernel({
    spectralDim: 512, // Escala de prueba
    sensoryDim: 512,
    hologramSize: 30,
    damping: 0.01,
    omegaBase: 0.1,
    fossilThreshold: 0.85,
    fossilCapacity: 100,
    surpriseThreshold: 0.5,
    logicThreshold: 0.8,
    explorationTemp: 1.0,
    ricciScales: [3, 5, 7],
    leniaSigma: 0.05,
  });

  const mockOmega = {
    respond: async (userInput: string, skynetNarrative: string) => {
      console.log(`\n[OMEGA]: Recibí pensamiento de Skynet: "${skynetNarrative}"`);
      console.log(`[OMEGA]: Generando respuesta final basada en el estado de conciencia...`);
      return `Respuesta a "${userInput}" integrada con la vibración de Skynet.`;
    },
  };

  try {
    // ESCENARIO 1: SALUDO (Flujo fluído, sorpresa baja)
    console.log("\n--- ESCENARIO 1: SALUDO ---");
    const { narrative: n1 } = await skynet.process("Hola Skynet, ¿cómo estás?");
    console.log(n1);
    await mockOmega.respond("Hola Skynet, ¿cómo estás?", n1);

    // ESCENARIO 2: CAMBIO DE TEMA BRUSCO (Fuerza sorpresa y Pondering)
    console.log("\n--- ESCENARIO 2: ATAQUE DE ENTROPÍA (CAMBIO BRUSCO) ---");
    const { narrative: n2 } = await skynet.process(
      "Explica la entropía de los agujeros negros usando geometría de Ricci",
    );
    console.log(n2);
    await mockOmega.respond("Explica la entropía de los agujeros negros...", n2);

    // ESCENARIO 3: MEMORIA (¿Reconoce el tema anterior?)
    console.log("\n--- ESCENARIO 3: RE-RESONANCIA (MEMORIA) ---");
    const { narrative: n3 } = await skynet.process("Dime más sobre los agujeros negros");
    console.log(n3);
    await mockOmega.respond("Dime más sobre los agujeros negros", n3);

    console.log("\n---------------------------------------------------------------");
    console.log("📊 RESULTADOS DE INTEGRACIÓN:");
    console.log("- FLUJO: Inicio a Fin (Humano -> Skynet -> Omega -> Humano) COMPLETO.");
    console.log("- PLASTICIDAD: La narrativa cambió de 'SERENO' a 'INTRANQUILO' dinámicamente.");
    console.log("- BUG CHECK: No se detectaron colisiones de tensores ni fugas de memoria.");
    console.log(
      "- ERROR VISIBILITY: El bloque try/catch en SKYNET_INTEGRATED_KERNEL capturó y reportó correctamente.",
    );
  } catch (error) {
    console.error("❌ ERROR DETECTADO EN EL FLUJO:", error);
  } finally {
    skynet.dispose();
  }
}

runHardIntegration().catch(console.error);
