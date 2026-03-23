import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkInteractionLock,
  createInteractionLock,
  refreshInteractionLock,
  sleep,
  startAutonomousDaemon,
} from "./daemon-cooperative.js";

const tmpDirs: string[] = [];

async function createWorkspaceRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "openskynet-omega-daemon-"));
  tmpDirs.push(root);
  return root;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    tmpDirs.splice(0, tmpDirs.length).map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
});

describe("omega daemon cooperative", () => {
  it("writes structured interaction lock payloads", async () => {
    const workspaceRoot = await createWorkspaceRoot();

    await createInteractionLock(workspaceRoot);

    const raw = await fs.readFile(path.join(workspaceRoot, ".interaction-lock"), "utf-8");
    const parsed = JSON.parse(raw) as { owner: string; pid: number; refreshedAt: number };
    expect(parsed).toMatchObject({
      owner: "tui",
      pid: process.pid,
      refreshedAt: expect.any(Number),
    });
  });

  it("refreshInteractionLock updates the lock timestamp until cleanup", async () => {
    const workspaceRoot = await createWorkspaceRoot();

    const stop = await refreshInteractionLock(workspaceRoot, 20);
    const lockPath = path.join(workspaceRoot, ".interaction-lock");
    const first = JSON.parse(await fs.readFile(lockPath, "utf-8")) as { refreshedAt: number };

    await sleep(40);
    const second = JSON.parse(await fs.readFile(lockPath, "utf-8")) as { refreshedAt: number };
    expect(second.refreshedAt).toBeGreaterThanOrEqual(first.refreshedAt);

    await stop();
    await expect(fs.stat(lockPath)).rejects.toThrow();
  });

  it("treats stale locks as inactive and deletes them", async () => {
    const workspaceRoot = await createWorkspaceRoot();
    const lockPath = path.join(workspaceRoot, ".interaction-lock");
    await fs.writeFile(lockPath, "{}\n", "utf-8");
    const staleSecondsAgo = Date.now() - 24 * 60 * 60 * 1000;
    await fs.utimes(lockPath, staleSecondsAgo / 1000, staleSecondsAgo / 1000);

    await expect(checkInteractionLock(lockPath)).resolves.toBe(false);
    await expect(fs.stat(lockPath)).rejects.toThrow();
  });

  it("supports cooperative shutdown via AbortSignal", async () => {
    const workspaceRoot = await createWorkspaceRoot();
    const controller = new AbortController();
    const runHeartbeatCycle = vi.fn(async () => {
      controller.abort(new Error("stop"));
    });

    await startAutonomousDaemon(
      { workspaceRoot, sessionKey: "main", signal: controller.signal },
      {
        checkInteractionLock: vi.fn(async () => false),
        runHeartbeatCycle,
        sleep: vi.fn(async (_ms, signal) => {
          if (signal?.aborted) throw signal.reason;
        }),
        log: vi.fn(),
        error: vi.fn(),
      },
    );

    expect(runHeartbeatCycle).toHaveBeenCalledTimes(1);
  });
});
