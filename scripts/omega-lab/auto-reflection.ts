/**
 * auto-reflection.ts
 * ===================
 * Módulo de reflexión automática que sintetiza episodes de recovery
 * en reglas aprendidas persistentes.
 *
 * Ejecutado cada N ciclos de heartbeat para evitar overhead.
 * APPEND-ONLY a memory/omega-learned-rules.md
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { OmegaRecoveryEpisode } from "./episodic-recall.js";
import { loadOmegaRecoveryEpisodeRecall } from "./episodic-recall.js";

export type LearnedRule = {
  errorPattern: string;
  solution: string;
  successCount: number;
  failureCount: number;
  confidence: number;
  lastUpdated: string;
  source: string; // "session:abc:123" or similar
};

/**
 * Carga episodes recientes y agrupa por errorKind
 */
async function loadRecentEpisodes(
  workspaceRoot: string,
  sessionKey: string,
  maxEpisodes: number = 20,
): Promise<Map<string, OmegaRecoveryEpisode[]>> {
  try {
    const episodes = await loadOmegaRecoveryEpisodeRecall({
      workspaceRoot,
      sessionKey,
      task: "", // vacío = cargar todos
      validation: { expectsJson: false, expectedKeys: [], expectedPaths: [] },
      maxResults: maxEpisodes,
    });

    // Agrupar por errorKind
    const grouped = new Map<string, OmegaRecoveryEpisode[]>();
    for (const episode of episodes) {
      if (!episode.errorKind) continue;
      if (!grouped.has(episode.errorKind)) {
        grouped.set(episode.errorKind, []);
      }
      grouped.get(episode.errorKind)!.push(episode);
    }
    return grouped;
  } catch {
    return new Map();
  }
}

/**
 * Calcula confidence score basado en historial de éxito/fallo
 */
function calculateConfidence(successCount: number, failureCount: number): number {
  if (successCount + failureCount === 0) return 0;
  const rate = successCount / (successCount + failureCount);
  // Ajuste por sample size: más intentos = más confianza en el score
  const sampleSizeFactor = Math.min(1, (successCount + failureCount) / 10);
  return rate * sampleSizeFactor;
}

/**
 * Genera sugerencia de solución basada en episodes exitosos
 */
function suggestSolution(episodes: OmegaRecoveryEpisode[]): string {
  const successful = episodes.filter((e) => e.status === "completed");
  if (successful.length === 0) return "Unknown solution (no successes yet)";

  // Tomar la ruta más reciente exitosa
  const latestSuccess = successful.sort((a, b) => b.updatedAt - a.updatedAt)[0];

  if (latestSuccess?.lastRoute) {
    return `Apply route: ${latestSuccess.lastRoute}`;
  }

  if (latestSuccess?.nextRecoveryStep.reason) {
    return latestSuccess.nextRecoveryStep.reason;
  }

  return "Review successful recovery steps";
}

/**
 * Sintetiza episodes en una regla aprendida
 */
function synthesizeRule(errorKind: string, episodes: OmegaRecoveryEpisode[]): LearnedRule {
  const successful = episodes.filter((e) => e.status === "completed").length;
  const failed = episodes.filter((e) => e.status !== "completed").length;
  const confidence = calculateConfidence(successful, failed);

  return {
    errorPattern: errorKind,
    solution: suggestSolution(episodes),
    successCount: successful,
    failureCount: failed,
    confidence,
    lastUpdated: new Date().toISOString(),
    source: `episode-synthesis:${episodes.length}`,
  };
}

/**
 * Formatea regla para Markdown
 */
function formatRuleMarkdown(rule: LearnedRule, ruleId: number): string {
  const tier =
    rule.confidence > 0.8
      ? "High Confidence"
      : rule.confidence > 0.4
        ? "Medium Confidence"
        : "Low Confidence";

  const lines = [
    `## Rule #${ruleId}: ${rule.errorPattern} (${tier})`,
    "",
    `**Error Pattern:** ${rule.errorPattern}`,
    `**Solution:** ${rule.solution}`,
    `**Evidence:** ${rule.successCount} successes, ${rule.failureCount} failures`,
    `**Confidence:** ${(rule.confidence * 100).toFixed(1)}%`,
    `**Last Updated:** ${rule.lastUpdated}`,
    `**Source:** ${rule.source}`,
    "",
  ];

  return lines.join("\n");
}

/**
 * Escribe reglas aprendidas a memory/omega-learned-rules.md
 * APPEND-ONLY: nunca sobrescribe
 */
async function writeLearnedRules(workspaceRoot: string, rules: LearnedRule[]): Promise<void> {
  const filePath = path.join(workspaceRoot, "memory", "omega-learned-rules.md");

  // Verificar que el directorio existe
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  // Leer contenido actual
  let currentContent = "";
  try {
    currentContent = await fs.readFile(filePath, "utf-8");
  } catch {
    // Archivo no existe, crear vacío
    currentContent = "";
  }

  // Agregar nuevas reglas
  const newRules = rules
    .sort((a, b) => b.confidence - a.confidence) // Por confianza (descendente)
    .map((rule, idx) => formatRuleMarkdown(rule, idx + 1))
    .join("");

  const timestamp = new Date().toISOString();
  const header =
    currentContent.length === 0
      ? `# Learned Rules (OpenSkyNet)\n\nAuto-generated on ${timestamp}\n\n`
      : "";

  const reflectionSection = `## Reflection Cycle (${timestamp})\n\n${newRules}\n`;

  //  APPEND
  const finalContent = header + currentContent + reflectionSection;
  await fs.writeFile(filePath, finalContent, "utf-8");
}

/**
 * Ejecuta ciclo de reflexión automática
 * Llamar cada N heartbeats (ej: cada 30 minutos de sesión operativa)
 */
export async function executeAutoReflection(params: {
  workspaceRoot: string;
  sessionKey: string;
}): Promise<{ rulesGenerated: number; timestamp: string }> {
  const timestamp = new Date().toISOString();

  // Cargar episodes recientes
  const groupedEpisodes = await loadRecentEpisodes(
    params.workspaceRoot,
    params.sessionKey,
    20, // últimos 20 episodes
  );

  // Sintetizar reglas
  const rules: LearnedRule[] = [];
  for (const [errorKind, episodes] of groupedEpisodes) {
    if (episodes.length >= 2) {
      // Solo sintetizar si hay >= 2 ejemplos
      const rule = synthesizeRule(errorKind, episodes);
      if (rule.confidence > 0.3) {
        // Solo guardar si tiene algo de confianza
        rules.push(rule);
      }
    }
  }

  // Escribir a memoria
  if (rules.length > 0) {
    await writeLearnedRules(params.workspaceRoot, rules);
  }

  return {
    rulesGenerated: rules.length,
    timestamp,
  };
}

/**
 * Calcula si es momento de reflexionar basado en turn count
 */
export function shouldReflect(turnCount: number, reflectionIntervalTurns: number = 100): boolean {
  return turnCount % reflectionIntervalTurns === 0 && turnCount > 0;
}
