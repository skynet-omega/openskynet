import fs from "node:fs/promises";
import path from "node:path";
import { harvestResearch } from "./research-harvester.js";

async function runHarvest() {
  const workspaceRoot = process.cwd();
  console.log(`[skynet-harvest] Running harvester in ${workspaceRoot}...`);

  const artifact = await harvestResearch(workspaceRoot);

  console.log(`[skynet-harvest] Harvest completed. ID: ${artifact.id}`);
  console.log(`[skynet-harvest] Finding count: ${artifact.findings.length}`);
  console.log(`[skynet-harvest] Next steps: ${artifact.nextSteps.join(", ")}`);

  const memoryPath = path.join(workspaceRoot, "memory", "SKYNET_RESEARCH_HARVEST.md");
  const exists = await fs
    .access(memoryPath)
    .then(() => true)
    .catch(() => false);

  if (exists) {
    console.log(`[skynet-harvest] Successfully persisted artifact to ${memoryPath}`);
  } else {
    console.error(`[skynet-harvest] FAILED to persist artifact to ${memoryPath}`);
    process.exit(1);
  }
}

runHarvest().catch((err) => {
  console.error("[skynet-harvest] Error running harvester:", err);
  process.exit(1);
});
