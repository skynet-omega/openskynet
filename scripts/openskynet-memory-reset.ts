import path from "node:path";
import { resolveOmegaWorkspaceRoot } from "../src/omega/autonomous-runtime.js";
import { planOpenSkynetMemoryReset, resetOpenSkynetMemory } from "../src/omega/living-memory.js";

async function main() {
  const workspaceRoot = resolveOmegaWorkspaceRoot({ cwd: process.cwd() });
  const execute = process.argv.includes("--execute");
  const includeHumanReadable = process.argv.includes("--include-human-readable");

  const targets = await planOpenSkynetMemoryReset({
    workspaceRoot,
    includeHumanReadable,
  });

  if (!execute) {
    console.log("OpenSkyNet memory reset plan");
    console.log(`Workspace: ${workspaceRoot}`);
    console.log(`Include human-readable artifacts: ${includeHumanReadable ? "yes" : "no"}`);
    console.log("Use --execute to apply.");
    if (targets.length === 0) {
      console.log("Nothing to reset.");
      return;
    }
    for (const target of targets) {
      console.log(`- ${path.relative(workspaceRoot, target) || target}`);
    }
    return;
  }

  const moved = await resetOpenSkynetMemory({
    workspaceRoot,
    includeHumanReadable,
  });
  console.log("OpenSkyNet memory reset complete.");
  for (const item of moved) {
    console.log(`- ${path.relative(workspaceRoot, item.from) || item.from} -> ${item.to}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
