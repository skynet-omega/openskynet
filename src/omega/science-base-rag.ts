import fs from "node:fs/promises";
import path from "node:path";

/**
 * Reads SCIENCE_BASE.md and extracts the most relevant rules for a given query.
 * Works as a lightweight local RAG (Retrieval-Augmented Generation)
 * to avoid blowing up the context window.
 */
export async function queryScienceBase(params: {
  workspaceRoot: string;
  query: string;
  maxRules?: number;
}): Promise<string[]> {
  const { workspaceRoot, query, maxRules = 3 } = params;
  const filePath = path.join(workspaceRoot, "SCIENCE_BASE.md");

  try {
    const content = await fs.readFile(filePath, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim().length > 0);

    // Stop words to ignore in query
    const stopWords = new Set([
      "a",
      "an",
      "the",
      "and",
      "or",
      "to",
      "in",
      "of",
      "for",
      "with",
      "on",
      "fix",
      "update",
      "create",
      "make",
    ]);

    // Extract keywords from query
    const keywords = query
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w));

    if (keywords.length === 0) return [];

    // Score lines based on keyword matches
    const scoredLines = lines
      .map((line) => {
        const lineLower = line.toLowerCase();
        let score = 0;
        for (const kw of keywords) {
          if (lineLower.includes(kw)) score++;
        }
        return { line, score };
      })
      .filter((l) => l.score > 0)
      .sort((a, b) => b.score - a.score);

    // Return the top N rules
    return scoredLines.slice(0, maxRules).map((l) => l.line.trim());
  } catch (err) {
    // File might not exist or be unreadable
    return [];
  }
}
