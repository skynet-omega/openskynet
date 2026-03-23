import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

async function runAudit() {
  console.log("🔍 INICIANDO AUDITORÍA ESTRATÉGICA DE PIPELINE (OMEGA-R1)");

  const files = [
    "src/omega/heartbeat.ts",
    "src/omega/world-model.ts",
    "src/omega/executive-state.ts",
    "src/omega/operational-memory.ts",
  ];

  const results = [];

  for (const file of files) {
    const content = await fs.readFile(file, "utf-8");
    const silentCatches = (content.match(/catch\s*\(\s*\)\s*=>\s*undefined/g) || []).length;
    const emptyCatches = (content.match(/catch\s*\{\s*\}/g) || []).length;
    const totalLines = content.split("\n").length;

    results.push({
      file,
      silentCatches,
      emptyCatches,
      ratio: (((silentCatches + emptyCatches) / totalLines) * 100).toFixed(2) + "%",
    });
  }

  console.table(results);
}

runAudit();
