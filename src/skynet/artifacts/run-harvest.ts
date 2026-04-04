import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appendSkynetCausalEpisode } from "../causal-valence/episode-ledger.js";
import { harvestSkynetObservedCausalEpisodes } from "../causal-valence/observed-harvester.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, "../../..");

async function runHarvest() {
  console.log("Starting Causal Valence Harvest...");

  // Find recent sessions (last 7 days in March/April 2026)
  const sessionFiles = execSync(
    'find ~/.codex/sessions/2026/03 ~/.codex/sessions/2026/04 -name "*.jsonl" -mtime -7 2>/dev/null || true',
  )
    .toString()
    .split("\n")
    .filter(Boolean);

  if (sessionFiles.length === 0) {
    console.log("No recent sessions found to harvest.");
    return;
  }

  console.log(`Found ${sessionFiles.length} session files.`);

  const result = await harvestSkynetObservedCausalEpisodes({ sessionFiles });
  console.log(
    `Harvested ${result.episodes.length} episodes (skipped ${result.skippedToolResults}).`,
  );

  for (const episode of result.episodes) {
    await appendSkynetCausalEpisode({
      workspaceRoot,
      sessionKey: episode.sessionKey,
      context: episode.context,
      transition: episode.transition,
      outcome: episode.outcome,
      recordedAt: episode.recordedAt,
    });
  }

  console.log("Harvest complete.");
}

runHarvest().catch((err) => {
  console.error("Harvest failed:", err);
  process.exit(1);
});
