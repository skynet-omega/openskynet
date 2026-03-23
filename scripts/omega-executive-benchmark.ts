import fs from "node:fs/promises";
import path from "node:path";
import { computeOmegaExecutiveBenchmarkSummary } from "./lib/omega-executive-benchmark.js";

async function main() {
  const outIndex = process.argv.indexOf("--out");
  const outPath = outIndex >= 0 ? process.argv[outIndex + 1] : undefined;
  const summary = computeOmegaExecutiveBenchmarkSummary();
  const payload = {
    generatedAt: new Date().toISOString(),
    summary,
  };
  if (outPath) {
    const resolved = path.resolve(outPath);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  }
  console.log(JSON.stringify(payload, null, 2));
  process.exit(summary.targetedImprovementValidated ? 0 : 1);
}

await main();
