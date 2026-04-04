import fs from "node:fs/promises";
import path from "node:path";

const MAX_SCIENCE_BASE_RULES = 128;

/**
 * Executes a "sleep cycle" for the empirical memory.
 * It reads SCIENCE_BASE.md, deduplicates rules, groups similar findings,
 * and rewrites the file to prevent it from growing indefinitely.
 */
export async function compressScienceBase(params: { workspaceRoot: string }): Promise<{
  originalLines: number;
  newLines: number;
  status: "compressed" | "skipped" | "error";
}> {
  const filePath = path.join(params.workspaceRoot, "SCIENCE_BASE.md");

  try {
    const content = await fs.readFile(filePath, "utf-8");
    const lines = content.split("\n");

    const headerLines: string[] = [];
    const knowledgeLines: string[] = [];
    const tableLines: string[] = [];

    // Parse logic
    let inTable = false;
    for (const line of lines) {
      if (line.trim().startsWith("|") && line.includes("|", 1)) {
        inTable = true;
        tableLines.push(line);
      } else if (inTable) {
        // Left the table
        inTable = false;
        knowledgeLines.push(line);
      } else {
        if (line.toLowerCase().includes("ciencia") || line.startsWith("#")) {
          headerLines.push(line);
        } else {
          knowledgeLines.push(line);
        }
      }
    }

    // Process table: keep only the most recent entry for exact same task + files
    const tableRecords = new Map<string, string>();
    const tableHeaders = tableLines.slice(0, 2); // Assume first two lines are headers + separator
    const tableBody = tableLines.slice(2);

    for (const row of tableBody) {
      const cols = row.split("|").map((c) => c.trim());
      if (cols.length >= 4) {
        const timestamp = cols[1];
        const task = cols[2];
        const files = cols[3];
        const key = `${task}::${files}`.toLowerCase();

        // We just overwrite, so the last one (most recent) wins
        tableRecords.set(key, row);
      }
    }

    // Deduplicate general knowledge lines (ignoring empty lines)
    const uniqueKnowledge = new Set<string>();
    const cleanedKnowledge: string[] = [];
    for (const k of knowledgeLines) {
      const trimmed = k.trim();
      if (!trimmed) {
        cleanedKnowledge.push(k); // preserve whitespace
        continue;
      }
      if (!uniqueKnowledge.has(trimmed)) {
        uniqueKnowledge.add(trimmed);
        cleanedKnowledge.push(k);
      }
    }

    // Reconstruct
    const compactedTableRows = Array.from(tableRecords.values()).slice(-MAX_SCIENCE_BASE_RULES);
    const newContent = [
      ...headerLines,
      ...cleanedKnowledge,
      ...tableHeaders,
      ...compactedTableRows,
    ].join("\n");

    if (newContent.length !== content.length) {
      await fs.writeFile(filePath, newContent, "utf-8");
      return {
        originalLines: lines.length,
        newLines: newContent.split("\n").length,
        status: "compressed",
      };
    }

    return { originalLines: lines.length, newLines: lines.length, status: "skipped" };
  } catch (error) {
    console.error("Failed to compress SCIENCE_BASE.md", error);
    return { originalLines: 0, newLines: 0, status: "error" };
  }
}
