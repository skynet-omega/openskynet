/**
 * src/omega/research-loop.ts
 * ==========================
 * FRENTE C: Loop Cerrado de Investigación Autónoma
 *
 * Cuando JEPA detecta correlación fuerte entre frustración y fallos,
 * el sistema genera un archivo .prose de investigación autónoma.
 *
 * Cierra el ciclo: Anomalía → Análisis → Hipótesis → Registro
 * sin necesidad de intervención humana.
 *
 * Los archivos .prose son legibles por humanos y también por el sistema
 * en próximos ciclos (via collectMemoryCandidates en heartbeat.ts).
 */

import fs from "node:fs/promises";
import path from "node:path";
import { getActiveLearningStrategy } from "./active-learning-strategy.js";
import { analyzeJepaCorrelation } from "./jepa-empirical-logger.js";

const RESEARCH_CORRELATION_THRESHOLD = 0.3;
const RESEARCH_MEMORY_DIR = "memory";

/**
 * Resultado de un ciclo de investigación autónoma.
 */
export type ResearchLoopResult =
  | {
      kind: "prose_written";
      filePath: string;
      correlationScore: number;
      hypotheses: string[];
    }
  | { kind: "insufficient_data"; reason: string }
  | { kind: "below_threshold"; correlationScore: number }
  | { kind: "no_new_hypotheses"; reason: string };

/**
 * Evalúa el log JEPA y, si detecta correlación fuerte, genera un archivo `.prose`
 * de investigación autónoma en `memory/`.
 *
 * El .prose documenta:
 * - La anomalía detectada (frustración elevada antes de fallos)
 * - Las hipótesis generadas por el ActiveLearningStrategy
 * - Las condiciones de test para falsificar cada hipótesis
 * - La recomendación JEPA (integrar o podar el subsistema)
 *
 * @param workspaceRoot - Raíz del workspace de OpenSkyNet
 * @param sessionKey - Clave de sesión actual
 */
export async function runResearchLoop(params: {
  workspaceRoot: string;
  sessionKey: string;
}): Promise<ResearchLoopResult> {
  // 1. Analizar correlación JEPA
  const analysis = await analyzeJepaCorrelation(params.workspaceRoot);

  if (analysis.totalSamples < 5 || analysis.totalEvents < 2) {
    return {
      kind: "insufficient_data",
      reason: `Solo ${analysis.totalSamples} muestras y ${analysis.totalEvents} eventos. Mínimo: 5 muestras, 2 eventos.`,
    };
  }

  if (
    analysis.correlationScore === null ||
    analysis.correlationScore <= RESEARCH_CORRELATION_THRESHOLD
  ) {
    return {
      kind: "below_threshold",
      correlationScore: analysis.correlationScore ?? 0,
    };
  }

  // 2. Obtener hipótesis activas del ActiveLearningStrategy
  const learningStrategy = getActiveLearningStrategy();
  const stats = learningStrategy.getStats();
  const state = learningStrategy.getState();
  const untestedHypotheses = state.activeHypotheses.filter((h) => !h.tested).slice(0, 3);

  if (untestedHypotheses.length === 0) {
    return {
      kind: "no_new_hypotheses",
      reason: "Todas las hipótesis activas ya fueron testeadas.",
    };
  }

  // 3. Generar el archivo .prose
  const timestamp = new Date().toISOString().slice(0, 19).replace("T", "-").replace(/:/g, "");
  const fileName = `omega-research-${timestamp}.prose`;
  const memoryDir = path.join(params.workspaceRoot, RESEARCH_MEMORY_DIR);
  const filePath = path.join(memoryDir, fileName);

  const proseLines = [
    `# Investigación Autónoma — ${new Date().toISOString().slice(0, 10)}`,
    `> Generado por Omega ResearchLoop | Sesión: ${params.sessionKey}`,
    "",
    "## Anomalía Detectada",
    "",
    `**Correlación JEPA:** ${(analysis.correlationScore * 100).toFixed(1)}% (umbral: ${(RESEARCH_CORRELATION_THRESHOLD * 100).toFixed(0)}%)`,
    `**Frustración media antes de fallos:** ${analysis.avgFrustrationBeforeFailure?.toFixed(3) ?? "N/A"}`,
    `**Frustración en períodos normales:** ${analysis.avgFrustrationNormal?.toFixed(3) ?? "N/A"}`,
    `**Muestras analizadas:** ${analysis.totalSamples} | **Eventos:** ${analysis.totalEvents}`,
    "",
    `**Recomendación JEPA:** ${analysis.recommendation}`,
    "",
    "---",
    "",
    "## Hipótesis Generadas",
    "",
    ...untestedHypotheses.flatMap((h, i) => [
      `### H${i + 1}: ${h.hypothesis}`,
      `- **Confianza prior:** ${(h.priorConfidence * 100).toFixed(0)}%`,
      `- **Condiciones de test:**`,
      ...h.testConditions.map((c) => `  - ${c}`),
      "",
    ]),
    "---",
    "",
    "## Estado de Aprendizaje",
    "",
    `- Total hipótesis: ${stats.totalHypotheses}`,
    `- Testeadas: ${stats.testedHypotheses}`,
    `- Tasa de confirmación: ${(stats.confirmedRate * 100).toFixed(0)}%`,
    `- Tasa de aprendizaje: ${(stats.avgLearningRate * 100).toFixed(1)}% por ciclo`,
    `- Dominios top: ${stats.topLearningDomains.join(", ") || "N/A"}`,
    "",
    "---",
    "",
    "## Próxima Acción Sugerida",
    "",
    analysis.correlationScore > 0.5
      ? "🔴 **Acción urgente:** Integrar JEPA en tension-engine.ts como señal primaria."
      : "🟡 **Acción recomendada:** Ajustar umbrales de frustración. Continuar recolección.",
    "",
    `*Este documento fue generado autónomamente. Verificar hallazgos antes de actuar.*`,
  ];

  // 4. Escribir el archivo
  await fs.mkdir(memoryDir, { recursive: true });
  await fs.writeFile(filePath, proseLines.join("\n"), "utf-8");

  return {
    kind: "prose_written",
    filePath,
    correlationScore: analysis.correlationScore,
    hypotheses: untestedHypotheses.map((h) => h.hypothesis),
  };
}

/**
 * Verifica si ya existe un .prose reciente (evita duplicados en ciclos rápidos).
 * @returns true si existe un .prose generado en las últimas 6 horas
 */
export async function hasRecentResearchProse(workspaceRoot: string): Promise<boolean> {
  const memoryDir = path.join(workspaceRoot, RESEARCH_MEMORY_DIR);
  try {
    const entries = await fs.readdir(memoryDir);
    const proseFiles = entries.filter(
      (f: string) => f.endsWith(".prose") && f.startsWith("omega-research-"),
    );

    if (proseFiles.length === 0) return false;

    // Verificar si el más reciente es de las últimas 6 horas
    const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
    const mostRecent = proseFiles.sort().at(-1);
    if (!mostRecent) return false;

    const stat = await fs.stat(path.join(memoryDir, mostRecent));
    return Date.now() - stat.mtimeMs < SIX_HOURS_MS;
  } catch {
    return false;
  }
}
