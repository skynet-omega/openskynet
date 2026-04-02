import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runSkynetPulse } from "./pulse.js";
import { syncOpenSkynetRuntimeAuthority } from "./runtime-authority.js";

describe("skynet pulse", () => {
  let workspaceRoot = "";

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skynet-pulse-"));
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it("writes a pulse file from the current world model state", async () => {
    const result = await runSkynetPulse({
      workspaceRoot,
      sessionKey: "agent:openskynet:main",
      runResearch: false,
    });

    expect(result.focusTitle).toBe("Agenda científica endógena");
    expect(result.nucleusMode).toBe("explore");
    expect(result.topWorkItem).toContain("Empujar foco activo");
    expect(result.degradedComponents).toEqual([]);
    expect(result.benchmarkSnapshotPath).toContain(
      path.join(".openskynet", "internal-project-benchmark", "agent_openskynet_main.json"),
    );

    const pulse = await fs.readFile(path.join(workspaceRoot, "memory", "SKYNET_PULSE.md"), "utf-8");
    expect(pulse).toContain("# SKYNET Pulse");
    expect(pulse).toContain("Agenda científica endógena");
    expect(pulse).toContain("Degraded components: none");
    const benchmarkSnapshot = JSON.parse(
      await fs.readFile(
        path.join(
          workspaceRoot,
          ".openskynet",
          "internal-project-benchmark",
          "agent_openskynet_main.json",
        ),
        "utf-8",
      ),
    ) as {
      benchmark?: { focusKey?: string | null };
    };
    expect(benchmarkSnapshot.benchmark?.focusKey).toBe("endogenous_science_agenda");
    const livingState = JSON.parse(
      await fs.readFile(
        path.join(
          workspaceRoot,
          ".openskynet",
          "living-memory",
          "state",
          "agent_openskynet_main.json",
        ),
        "utf-8",
      ),
    ) as {
      internalProjectState?: { focusKey?: string };
    };
    expect(livingState.internalProjectState?.focusKey).toBe("endogenous_science_agenda");
  });

  it("keeps pulse aligned with the shared runtime authority", async () => {
    const runtime = await syncOpenSkynetRuntimeAuthority({
      workspaceRoot,
      sessionKey: "agent:openskynet:main",
    });
    const pulse = await runSkynetPulse({
      workspaceRoot,
      sessionKey: "agent:openskynet:main",
      runResearch: false,
    });

    expect(pulse.topWorkItem).toBe(runtime.snapshot.skynetStudyProgram?.items[0]?.title);
    expect(pulse.commitment?.kind).toBe(runtime.commitment?.kind);
    expect(pulse.experimentPlan?.focusKey).toBe(runtime.experimentPlan?.focusKey);
    expect(pulse.degradedComponents).toEqual(runtime.degradedComponents);
  });
});
