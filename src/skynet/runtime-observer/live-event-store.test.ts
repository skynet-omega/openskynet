import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  acquireSkynetRuntimeObserverLiveLock,
  appendSkynetRuntimeObserverLiveObservation,
  releaseSkynetRuntimeObserverLiveLock,
  resolveSkynetRuntimeObserverLiveJsonlPath,
} from "./live-event-store.js";

const cleanupDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    cleanupDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
});

describe("runtime observer live event store", () => {
  it("acquires and releases a lock", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openskynet-live-tap-"));
    cleanupDirs.push(workspaceRoot);
    const lockPath = await acquireSkynetRuntimeObserverLiveLock({
      workspaceRoot,
      sessionKey: "agent:openskynet:main",
    });
    await expect(
      acquireSkynetRuntimeObserverLiveLock({
        workspaceRoot,
        sessionKey: "agent:openskynet:main",
      }),
    ).rejects.toThrow(/already active/);
    await releaseSkynetRuntimeObserverLiveLock(lockPath);
    await expect(
      acquireSkynetRuntimeObserverLiveLock({
        workspaceRoot,
        sessionKey: "agent:openskynet:main",
      }),
    ).resolves.toContain(".lock");
  });

  it("appends observations as jsonl", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openskynet-live-tap-"));
    cleanupDirs.push(workspaceRoot);
    await appendSkynetRuntimeObserverLiveObservation({
      workspaceRoot,
      sessionKey: "agent:openskynet:main",
      observation: {
        source: "gateway",
        event: "sessions.changed",
        recordedAt: 123,
        sessionKey: "agent:main:main",
        phase: "start",
      },
    });
    const jsonlPath = resolveSkynetRuntimeObserverLiveJsonlPath({
      workspaceRoot,
      sessionKey: "agent:openskynet:main",
    });
    const raw = await fs.readFile(jsonlPath, "utf-8");
    expect(raw).toContain('"event":"sessions.changed"');
  });
});
