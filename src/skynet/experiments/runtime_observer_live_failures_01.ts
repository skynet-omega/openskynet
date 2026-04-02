import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadSkynetRuntimeObserverLiveObservations } from "../runtime-observer/live-event-store.js";
import { harvestSkynetRuntimeLiveFailures } from "../runtime-observer/live-failure-harvester.js";

export type SkynetRuntimeObserverLiveFailures01Result = ReturnType<
  typeof harvestSkynetRuntimeLiveFailures
> & {
  status: "ok";
  workspaceRoot: string;
  sessionKey: string;
  jsonlPath: string;
};

function safeSessionKey(sessionKey: string): string {
  return (sessionKey.trim() || "main").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 64) || "main";
}

function resultPath(workspaceRoot: string, sessionKey: string): string {
  return path.join(
    workspaceRoot,
    ".openskynet",
    "skynet-experiments",
    `${safeSessionKey(sessionKey)}-runtime-observer-live-failures-01.json`,
  );
}

export async function runSkynetRuntimeObserverLiveFailures01(params?: {
  workspaceRoot?: string;
  sessionKey?: string;
}): Promise<SkynetRuntimeObserverLiveFailures01Result> {
  const workspaceRoot = params?.workspaceRoot ?? process.cwd();
  const sessionKey = params?.sessionKey ?? "agent:openskynet:main";
  const observations = await loadSkynetRuntimeObserverLiveObservations({
    workspaceRoot,
    sessionKey,
  });
  const harvested = harvestSkynetRuntimeLiveFailures({ observations });
  const jsonlPath = path.join(
    workspaceRoot,
    ".openskynet",
    "skynet-experiments",
    `${safeSessionKey(sessionKey)}-runtime-observer-live-01.jsonl`,
  );
  const result: SkynetRuntimeObserverLiveFailures01Result = {
    status: "ok",
    workspaceRoot,
    sessionKey,
    jsonlPath,
    ...harvested,
  };
  const outputPath = resultPath(workspaceRoot, sessionKey);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(result, null, 2) + "\n", "utf-8");
  return result;
}

async function main() {
  const result = await runSkynetRuntimeObserverLiveFailures01({
    workspaceRoot: process.cwd(),
    sessionKey: `agent:openskynet:${os.hostname().toLowerCase()}`,
  });
  console.log("--- Skynet Experiment: Runtime Observer Live Failures 01 ---");
  console.log(`Observed events: ${result.observedEvents}`);
  console.log(`Lifecycle errors: ${result.lifecycleErrors}`);
  console.log(`Classified lifecycle errors: ${result.classifiedLifecycleErrors}`);
  console.log(`Coverage: ${result.classificationCoverage.toFixed(2)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
