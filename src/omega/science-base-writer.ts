import fs from "node:fs/promises";
import path from "node:path";
import { compressScienceBase } from "./science-base-compressor.js";

const MAX_RULE_FILES = 5;
const AUTO_COMPRESS_RULE_THRESHOLD = 48;

function normalizeScienceBaseFiles(files: string[]): string[] {
  return Array.from(new Set(files.map((file) => file.trim()).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b))
    .slice(0, MAX_RULE_FILES);
}

function buildScienceBaseRuleKey(task: string, files: string[]): string {
  return `${task.trim().replace(/\s+/g, " ").toLowerCase()}::${files.join(",").toLowerCase()}`;
}

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
  const normalizedFiles = normalizeScienceBaseFiles(params.observedChangedFiles);
  if (normalizedFiles.length === 0) {
    return;
  }

  const files = normalizedFiles.join(", ");
  const taskPreview = params.task.trim().replace(/\s+/g, " ").slice(0, 80);
  const ruleKey = buildScienceBaseRuleKey(taskPreview, normalizedFiles);
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

  let tableRowCount = 0;
  for (const line of existing.split("\n")) {
    if (!line.startsWith("| 20")) {
      continue;
    }
    tableRowCount += 1;
    const parts = line
      .split("|")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length < 4) {
      continue;
    }

    const [, task, filesStr] = parts;
    const existingKey = buildScienceBaseRuleKey(
      task,
      normalizeScienceBaseFiles(filesStr.split(",")),
    );
    if (existingKey === ruleKey) {
      return;
    }
  }

  await fs.writeFile(scienceBasePath, `${existing.trimEnd()}\n${rule}`, "utf-8");

  if (tableRowCount + 1 >= AUTO_COMPRESS_RULE_THRESHOLD) {
    await compressScienceBase({ workspaceRoot: params.workspaceRoot }).catch(() => undefined);
  }
}
