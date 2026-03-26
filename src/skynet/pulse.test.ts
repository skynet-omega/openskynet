import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runSkynetPulse } from "./pulse.js";

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

    const pulse = await fs.readFile(path.join(workspaceRoot, "memory", "SKYNET_PULSE.md"), "utf-8");
    expect(pulse).toContain("# SKYNET Pulse");
    expect(pulse).toContain("Agenda científica endógena");
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
      skynet?: { focusKey?: string };
    };
    expect(livingState.skynet?.focusKey).toBe("endogenous_science_agenda");
  });
});
