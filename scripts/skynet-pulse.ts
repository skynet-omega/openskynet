import { runSkynetPulse } from "../src/skynet/pulse.js";

async function main() {
  const workspaceRoot = process.cwd();
  const sessionKey = "agent:openskynet:main";
  const runResearch = process.argv.includes("--research");
  const pulse = await runSkynetPulse({
    workspaceRoot,
    sessionKey,
    runResearch,
  });

  console.log("--- SKYNET Pulse ---");
  console.log(`Focus: ${pulse.focusTitle ?? "none"}`);
  console.log(`Mode: ${pulse.nucleusMode ?? "unknown"}`);
  console.log(
    `Continuity: ${
      typeof pulse.continuityScore === "number" ? pulse.continuityScore.toFixed(2) : "n/a"
    }`,
  );
  console.log(`Top item: ${pulse.topWorkItem ?? "none"}`);
  console.log(`Action: ${pulse.recommendedAction ?? "none"}`);
  if (pulse.researchLoop) {
    console.log(`Research loop: ${pulse.researchLoop.kind}`);
  }
  console.log(`Pulse file: ${pulse.filePath}`);
}

main().catch(console.error);
