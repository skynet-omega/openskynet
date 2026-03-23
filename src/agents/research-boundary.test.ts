import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const AGENTS_DIR = path.resolve("src/agents");
const FORBIDDEN_IMPORT_PATTERNS = [
  "model-comparison",
  "poc-test-runner",
  "poc-1-real-validation",
  "poc-1-test-all",
  "poc-2-grounding-validator",
  "poc-3-compressed-prompts",
];

async function listAgentSourceFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return listAgentSourceFiles(fullPath);
      }
      if (!entry.isFile() || !entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts")) {
        return [];
      }
      return [fullPath];
    }),
  );
  return files.flat();
}

describe("agents research boundary", () => {
  it("keeps research runners and benchmarks out of production imports", async () => {
    const sourceFiles = await listAgentSourceFiles(AGENTS_DIR);
    const offenders: string[] = [];

    for (const filePath of sourceFiles) {
      const source = await fs.readFile(filePath, "utf-8");
      for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
        if (source.includes(pattern)) {
          offenders.push(path.relative(process.cwd(), filePath).split(path.sep).join("/"));
          break;
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
