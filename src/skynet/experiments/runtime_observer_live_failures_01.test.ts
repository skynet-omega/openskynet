import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendSkynetRuntimeObserverLiveObservation } from "../runtime-observer/live-event-store.js";
import { runSkynetRuntimeObserverLiveFailures01 } from "./runtime_observer_live_failures_01.js";

const cleanupDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    cleanupDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
});

describe("runtime observer live failures 01", () => {
  it("writes a classified live failure artifact from live observations", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openskynet-live-failures-"));
    cleanupDirs.push(workspaceRoot);
    const sessionKey = "agent:openskynet:test";
    await appendSkynetRuntimeObserverLiveObservation({
      workspaceRoot,
      sessionKey,
      observation: {
        source: "gateway",
        event: "agent",
        recordedAt: 123,
        runId: "run-1",
        sessionKey,
        stream: "lifecycle",
        phase: "error",
        failureDomain: "environmental",
        failureClass: "provider_timeout",
        textPreview: "timed out",
      },
    });

    const result = await runSkynetRuntimeObserverLiveFailures01({ workspaceRoot, sessionKey });

    expect(result).toMatchObject({
      status: "ok",
      observedEvents: 1,
      lifecycleErrors: 1,
      classifiedLifecycleErrors: 1,
      classificationCoverage: 1,
      failureCountsByClass: {
        provider_timeout: 1,
      },
    });
    const outputPath = path.join(
      workspaceRoot,
      ".openskynet",
      "skynet-experiments",
      "agent_openskynet_test-runtime-observer-live-failures-01.json",
    );
    const raw = await fs.readFile(outputPath, "utf-8");
    expect(raw).toContain('"provider_timeout": 1');
  });
});
