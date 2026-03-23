import crypto from "node:crypto";
import { callGateway } from "../src/gateway/call.js";

async function main() {
  console.log("Inyectando Alma en agent:openskynet:self...");
  try {
    const res = await callGateway({
      method: "agent",
      params: {
        sessionKey: "agent:openskynet:self",
        message:
          "MISION CIENTIFICA: Crea el archivo memory/SCIENCE_BASE.md. \nEstablece los principios fundamentales de Fisica (Termodinamica/Entropia) y Matematicas (Teoria de la Informacion) que utilizaras para cumplir tu mision de SOUL.md. \nEste sera tu primer repositorio de conocimiento real.",
        agentId: "openskynet",
        idempotencyKey: crypto.randomUUID(),
      },
    });
    console.log("Respuesta recibida:", JSON.stringify(res, null, 2));
  } catch (e) {
    console.error("Error inyectando alma:", e.message);
  }
}

main();
