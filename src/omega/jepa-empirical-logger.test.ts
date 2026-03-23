import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withEnvAsync } from "../test-utils/env.js";

vi.mock("./runtime.js", () => ({
  runJepaTensionBridge: vi.fn(async () => ({
    frustration: 0,
    confidence: 0,
    error: "bridge unavailable",
  })),
}));

import { logJepaSample } from "./jepa-empirical-logger.js";

const tmpDirs: string[] = [];

describe("omega JEPA empirical logger", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(
      tmpDirs.splice(0, tmpDirs.length).map((dir) => fs.rm(dir, { recursive: true, force: true })),
    );
  });

  it("records bridge failures without noisy warnings in observational mode", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "omega-jepa-log-"));
    tmpDirs.push(workspaceRoot);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await withEnvAsync(
      {
        OPENSKYNET_OMEGA_JEPA_CONTROL: undefined,
        OPENSKYNET_OMEGA_JEPA_WARN: undefined,
      },
      async () => {
        await logJepaSample({
          workspaceRoot,
          sessionKey: "main",
          kernel: {
            revision: 2,
            sessionKey: "main",
            turnCount: 1,
            activeGoalId: undefined,
            identity: { continuityId: "cid", firstSeenAt: 1, lastSeenAt: 1 },
            world: { lastObservedChangedFiles: [] },
            goals: [],
            tension: {
              openGoalCount: 0,
              staleGoalCount: 0,
              failureStreak: 0,
              repeatedFailureKinds: [],
              pendingCorrection: false,
            },
            causalGraph: { files: [], edges: [] },
            updatedAt: 1,
          },
        });
      },
    );

    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("JEPA Bridge subproceso reportó error"),
    );
    const logPath = path.join(workspaceRoot, ".openskynet", "jepa-empirical-log.jsonl");
    await expect(fs.readFile(logPath, "utf-8")).resolves.toContain("bridge unavailable");
  });

  it("surfaces bridge failures when JEPA control is explicitly enabled", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "omega-jepa-log-"));
    tmpDirs.push(workspaceRoot);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await withEnvAsync({ OPENSKYNET_OMEGA_JEPA_CONTROL: "1" }, async () => {
      await logJepaSample({
        workspaceRoot,
        sessionKey: "main",
        kernel: {
          revision: 2,
          sessionKey: "main",
          turnCount: 1,
          activeGoalId: undefined,
          identity: { continuityId: "cid", firstSeenAt: 1, lastSeenAt: 1 },
          world: { lastObservedChangedFiles: [] },
          goals: [],
          tension: {
            openGoalCount: 0,
            staleGoalCount: 0,
            failureStreak: 0,
            repeatedFailureKinds: [],
            pendingCorrection: false,
          },
          causalGraph: { files: [], edges: [] },
          updatedAt: 1,
        },
      });
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("JEPA Bridge subproceso reportó error"),
    );
  });
});
