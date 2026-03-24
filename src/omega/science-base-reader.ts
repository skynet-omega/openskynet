/**
 * src/omega/science-base-reader.ts
 * ==================================
 * Lee SCIENCE_BASE.md y extrae invariantes causales verificadas.
 *
 * Estas invariantes se inyectan en el prompt de sesión para que el LLM
 * "recuerde" lo aprendido en sesiones anteriores — simulando soft weight
 * modification sin tocar los pesos del modelo.
 *
 * Ataques directamente el Muro 2 (Identidad Cognitiva Acumulativa).
 */

import fs from "node:fs/promises";
import path from "node:path";

const SCIENCE_BASE_FILE = "SCIENCE_BASE.md";
const MAX_INVARIANTS_IN_PROMPT = 8; // Máximas reglas a inyectar (balance costo/beneficio)
const MIN_TASK_LENGTH = 5; // Descartar entradas vacías o ruidosas

export interface ScienceBaseEntry {
  timestamp: string;
  task: string;
  files: string[];
  sessionKey: string;
}

/**
 * Lee el SCIENCE_BASE.md y devuelve las últimas N invariantes verificadas.
 * Retorna [] si el archivo no existe o está vacío.
 */
export async function loadScienceBaseInvariants(params: {
  workspaceRoot: string;
  limit?: number;
  relevantTask?: string; // Si se provee, filtra por similitud de task
}): Promise<ScienceBaseEntry[]> {
  const filePath = path.join(params.workspaceRoot, SCIENCE_BASE_FILE);
  const limit = params.limit ?? MAX_INVARIANTS_IN_PROMPT;

  try {
    const content = await fs.readFile(filePath, "utf-8");
    const lines = content.split("\n");

    // Parsear filas de la tabla markdown: | timestamp | task | files | session |
    const entries: ScienceBaseEntry[] = [];
    for (const line of lines) {
      if (!line.startsWith("| 20")) continue; // Solo filas de datos (comienzan con año)
      const parts = line
        .split("|")
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
      if (parts.length < 4) continue;
      const [timestamp, task, filesStr, sessionKey] = parts as [string, string, string, string];
      if (!task || task.length < MIN_TASK_LENGTH) continue;

      entries.push({
        timestamp,
        task,
        files: filesStr
          .split(",")
          .map((f) => f.trim())
          .filter(Boolean),
        sessionKey,
      });
    }

    // Si hay task relevante, priorizar entradas similares (simple: substring match)
    if (params.relevantTask) {
      const taskWords = params.relevantTask.toLowerCase().split(/\s+/);
      entries.sort((a, b) => {
        const aScore = taskWords.filter((w) => a.task.toLowerCase().includes(w)).length;
        const bScore = taskWords.filter((w) => b.task.toLowerCase().includes(w)).length;
        return bScore - aScore; // Mayor relevancia primero
      });
    }

    // Tomar las últimas N (o las más relevantes si hubo sort)
    return entries.slice(-limit);
  } catch {
    return [];
  }
}

/**
 * Formatea las invariantes como bloque para inyectar en el prompt.
 * Formato diseñado para que el LLM entienda y use los patrones.
 */
export function formatScienceBasePromptBlock(entries: ScienceBaseEntry[]): string {
  if (entries.length === 0) return "";

  const lines: string[] = [
    "[OMEGA Learned Invariants]",
    "Verified causal patterns from prior sessions. These are empirically confirmed — use them to bias decisions:",
    "",
  ];

  for (const entry of entries) {
    const filesShort = entry.files.slice(0, 3).join(", ");
    lines.push(`• "${entry.task.slice(0, 70)}" → touches: ${filesShort}`);
  }

  lines.push(
    "",
    "Apply these patterns when the current task resembles prior work. Deviate only with explicit justification.",
  );

  return lines.join("\n");
}

/**
 * Carga y formatea las invariantes en una sola llamada.
 * Retorna undefined si no hay invariantes disponibles.
 */
export async function buildScienceBasePromptSection(params: {
  workspaceRoot: string;
  relevantTask?: string;
  limit?: number;
}): Promise<string | undefined> {
  const entries = await loadScienceBaseInvariants(params);
  if (entries.length === 0) return undefined;
  return formatScienceBasePromptBlock(entries);
}
