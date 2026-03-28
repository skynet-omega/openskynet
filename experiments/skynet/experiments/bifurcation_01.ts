import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadOmegaWorldModelSnapshot } from "../../../src/omega/world-model.js";
import { recordSkynetBifurcation, stabilizeSkynetBifurcation } from "../bifurcation-engine.js";
import { runSkynetPulse } from "../pulse.js";

export async function runSkynetBifurcation01(params: {
  workspaceRoot: string;
  sessionKey: string;
}): Promise<void> {
  const label = "Nucleus Experiment: Bifurcation and Stabilization";
  const contextSnapshot = "Pulse 01 Intensify Verdict";
  const options = [
    "Continue abstract study",
    "Implement bifurcation-engine.ts",
    "Perform global refactor",
  ];
  const selected = "Implement bifurcation-engine.ts";

  console.log(`--- Skynet Experiment: Bifurcation 01 ---`);
  console.log(`Label: ${label}`);
  console.log(`Context: ${contextSnapshot}`);
  console.log(`Selected: ${selected}`);

  await recordSkynetBifurcation({
    workspaceRoot: params.workspaceRoot,
    sessionKey: params.sessionKey,
    label,
    contextSnapshot,
    options,
    selected,
  });

  console.log("Stabilizing bifurcation...");
  await stabilizeSkynetBifurcation({
    workspaceRoot: params.workspaceRoot,
    sessionKey: params.sessionKey,
  });

  await runSkynetPulse({
    workspaceRoot: params.workspaceRoot,
    sessionKey: params.sessionKey,
    runResearch: false,
  });

  const snapshot = await loadOmegaWorldModelSnapshot(params);
  console.log(`Continuity Score: ${snapshot.skynetContinuity?.continuityScore.toFixed(2)}`);
  console.log(
    `Commitment: ${snapshot.skynetCommitment?.kind} -> ${snapshot.skynetCommitment?.artifactKind}`,
  );
}

async function main() {
  const workspaceRoot = process.cwd();
  const sessionKey = "agent:openskynet:main";
  await runSkynetBifurcation01({
    workspaceRoot,
    sessionKey,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
