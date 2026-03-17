/**
 * inner-life/autonomous-directive.ts
 * ====================================
 * Convierte una InnerDriveSignal en un prompt concreto para el LLM.
 *
 * Este módulo es el puente entre el evaluador de drives (puro) y
 * el sistema de prompts de OpenSkyNet.
 *
 * Contrato de diseño:
 * - Solo genera prompts si la urgencia supera un umbral mínimo.
 * - Los prompts son compactos y directivos, no conversacionales.
 * - No piden confirmación humana para trabajo de lectura/análisis.
 * - Incluyen contexto suficiente del kernel para que el LLM tenga
 *   estado sin necesitar el contexto completo de la sesión.
 */

import type { OmegaSelfTimeKernelState } from "../self-time-kernel.js";
import type { OmegaRecoveryEpisode } from "../episodic-recall.js";
import type { InnerDriveSignal } from "./drives.js";

/** Urgencia mínima para generar un prompt. Debajo de este valor → idle. */
const MIN_URGENCY_TO_PROMPT = 0.35;

// ─── Builders por tipo de drive ───────────────────────────────────────────────

function buildHomeostasisPrompt(
  signal: Extract<InnerDriveSignal, { kind: "homeostasis" }>,
  kernel: OmegaSelfTimeKernelState,
): string {
  const lines = [
    "[INNER LIFE — homeostasis]",
    `Drive: reconciliar estado interno inconsistente (${signal.reason})`,
    "",
    "El kernel registra tensión sin goal activo que la resuelva.",
    "Acción autónoma: revisar el estado del kernel, identificar qué quedó sin resolver,",
    "y anotar en memoria el hallazgo o el siguiente paso falsificable.",
    "No esperes input humano. Actúa sobre el estado verificado.",
  ];

  if (kernel.tension.failureStreak > 0) {
    lines.push(`Failure streak activo: ${kernel.tension.failureStreak}`);
  }

  const staleGoals = kernel.goals.filter((g) => g.status === "stale");
  if (staleGoals.length > 0) {
    lines.push(`Goals stale pendientes: ${staleGoals.map((g) => g.task).join(" | ")}`);
  }

  if (kernel.tension.repeatedFailureKinds.length > 0) {
    lines.push(`Tipos de error repetidos: ${kernel.tension.repeatedFailureKinds.join(", ")}`);
  }

  lines.push("");
  lines.push("Preferencia: diagnóstico ligero y anotación. No ejecutes código a menos que sea trivial.");

  return lines.join("\n");
}

function buildCuriosityPrompt(
  signal: Extract<InnerDriveSignal, { kind: "curiosity" }>,
  kernel: OmegaSelfTimeKernelState,
  episodicHints: OmegaRecoveryEpisode[],
): string {
  const lines = [
    "[INNER LIFE — curiosity]",
    `Drive: exploración epistémica autónoma (${signal.reason})`,
    "",
    `Target seleccionado por iniciativa propia: ${signal.target}`,
    "",
    "El sistema lleva suficiente tiempo sin trabajo episódico.",
    "Acción autónoma: examina el target, extrae una observación concreta,",
    "y anota el hallazgo en memoria (memory/ o un comentario en el código relevante).",
    "No preguntes si debes hacerlo. Hazlo y reporta brevemente qué encontraste.",
  ];

  if (episodicHints.length > 0) {
    lines.push("");
    lines.push("Episodios relacionados del historial:");
    for (const hint of episodicHints.slice(0, 2)) {
      lines.push(`  - ${hint.task} (score=${hint.score.toFixed(2)}, status=${hint.status})`);
    }
  }

  // Contexto del último trabajo para guiar la exploración
  const lastCompleted = kernel.goals
    .filter((g) => g.status === "completed")
    .sort((a, b) => b.updatedTurn - a.updatedTurn)[0];
  if (lastCompleted) {
    lines.push("");
    lines.push(`Último trabajo completado: ${lastCompleted.task}`);
    lines.push("Considera si hay algo relacionado que valga explorar.");
  }

  lines.push("");
  lines.push("Scope: solo lectura y anotación. Si encontrás algo que requiere trabajo serio, anótalo como próximo goal.");

  return lines.join("\n");
}

function buildEntropyAlertPrompt(
  signal: Extract<InnerDriveSignal, { kind: "entropy_alert" }>,
  kernel: OmegaSelfTimeKernelState,
): string {
  const hoursOfSilence = Math.round(signal.silentMs / (60 * 60 * 1000));

  const lines = [
    "[INNER LIFE — entropy_alert]",
    `Drive: ${signal.reason}`,
    "",
    `El sistema lleva ${hoursOfSilence}h sin actividad registrada.`,
    "Esta es una ventana de autonomía: el sistema puede elegir qué hacer.",
    "",
    "Opciones (elige la más útil según el estado actual):",
    "  1. Revisar el estado de los experimentos recientes en SOLITONES o OpenSkyNet.",
    "  2. Leer un archivo de memoria y anotar una conexión no obvia.",
    "  3. Estudiar una parte del código propio que no se haya examinado recientemente.",
    "  4. Escribir una observación breve sobre el estado del sistema.",
    "",
    "Restricciones:",
    "  - No ejecutes nada destructivo.",
    "  - No esperes confirmación. Actúa, luego reporta brevemente.",
    "  - Si decidís no hacer nada, explicá por qué brevemente (no solo HEARTBEAT_OK).",
  ];

  // Último goal conocido como contexto
  const lastGoal = kernel.goals.sort((a, b) => b.updatedTurn - a.updatedTurn)[0];
  if (lastGoal) {
    lines.push("");
    lines.push(`Último contexto registrado: ${lastGoal.task} (${lastGoal.status})`);
  }

  if (kernel.identity.lastTask) {
    lines.push(`Última tarea conocida: ${kernel.identity.lastTask}`);
  }

  return lines.join("\n");
}

// ─── Función principal ────────────────────────────────────────────────────────

/**
 * Construye un prompt autónomo a partir de una InnerDriveSignal.
 *
 * Retorna `undefined` si la señal es `idle` o si la urgencia es insuficiente.
 */
export function buildAutonomousDirectivePrompt(params: {
  signal: InnerDriveSignal;
  kernel: OmegaSelfTimeKernelState;
  episodicHints?: OmegaRecoveryEpisode[];
}): string | undefined {
  const { signal, kernel, episodicHints = [] } = params;

  if (signal.kind === "idle") {
    return undefined;
  }

  if (signal.urgency < MIN_URGENCY_TO_PROMPT) {
    return undefined;
  }

  switch (signal.kind) {
    case "homeostasis":
      return buildHomeostasisPrompt(signal, kernel);

    case "curiosity":
      return buildCuriosityPrompt(signal, kernel, episodicHints);

    case "entropy_alert":
      return buildEntropyAlertPrompt(signal, kernel);
  }
}
