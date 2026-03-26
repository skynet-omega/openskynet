import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  resolveOpenSkynetBenchmarkCycleFile,
  syncOpenSkynetBenchmarkCycleSnapshot,
} from "./benchmark-cycle.js";

describe("benchmark cycle snapshot", () => {
  let workspaceRoot = "";

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openskynet-benchmark-cycle-"));
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it("writes a compact authoritative benchmark snapshot for autonomous cycles", async () => {
    const snapshot = await syncOpenSkynetBenchmarkCycleSnapshot({
      workspaceRoot,
      sessionKey: "agent:openskynet:main",
    });

    expect(snapshot.project.name).toBe("Skynet");
    expect(snapshot.benchmark.focusKey).toBe("endogenous_science_agenda");
    expect(snapshot.benchmark.recommendedAction).toContain("Empujar foco activo");
    expect(snapshot.cycleRules.oneConcreteStepOnly).toBe(true);
    expect(snapshot.cycleRules.benchmarkSnapshotIsDerived).toBe(true);
    expect(snapshot.runtime.cycleResultFile).toContain("agent_openskynet_main-last-cycle.json");

    const filePath = resolveOpenSkynetBenchmarkCycleFile({
      workspaceRoot,
      sessionKey: "agent:openskynet:main",
    });
    const persisted = JSON.parse(await fs.readFile(filePath, "utf-8")) as {
      benchmark?: { score?: number; commitmentTask?: string | null };
    };
    expect(persisted.benchmark?.score).toBeGreaterThan(0);
    expect(persisted.benchmark?.commitmentTask).toContain("Implement one executable");
  });
});
