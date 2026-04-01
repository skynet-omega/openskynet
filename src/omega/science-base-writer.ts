import fs from "node:fs/promises";
import path from "node:path";

/**
 * Appends a verified causal flow rule to SCIENCE_BASE.md.
 * Each entry represents: "To achieve [task], write to [files]."
 */
export async function appendScienceBaseRule(params: {
  workspaceRoot: string;
  task: string;
  observedChangedFiles: string[];
  sessionKey: string;
}): Promise<void> {
  const scienceBasePath = path.join(params.workspaceRoot, "SCIENCE_BASE.md");
  const timestamp = new Date().toISOString().slice(0, 19).replace("T", " ");
  const files = params.observedChangedFiles.slice(0, 5).join(", ");
  const taskPreview = params.task.slice(0, 80);
  const dedupeTaskPreview = params.task.slice(0, 40);
  const rule = `| ${timestamp} | ${taskPreview} | ${files} | ${params.sessionKey} |\n`;

  let existing = "";
  try {
    existing = await fs.readFile(scienceBasePath, "utf-8");
  } catch {
    existing = [
      "# SCIENCE_BASE — Reglas Causales Verificadas",
      "",
      "> Generado automáticamente por Omega. Cada fila = patrón de éxito verificado.",
      "> Formato: tarea → archivos modificados.",
      "",
      "| Timestamp | Tarea | Archivos Modificados | Sesión |",
      "|-----------|-------|---------------------|--------|",
      "",
    ].join("\n");
  }

  if (existing.includes(files) && existing.includes(dedupeTaskPreview)) {
    return;
  }

  await fs.writeFile(scienceBasePath, `${existing.trimEnd()}\n${rule}`, "utf-8");
}
