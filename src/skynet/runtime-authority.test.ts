import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { syncOpenSkynetRuntimeAuthority } from "./runtime-authority.js";

describe("skynet runtime authority", () => {
  let workspaceRoot = "";

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skynet-runtime-authority-"));
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it("consolidates world state, commitment, and living memory in one pass", async () => {
    const state = await syncOpenSkynetRuntimeAuthority({
      workspaceRoot,
      sessionKey: "agent:openskynet:main",
    });

    expect(state.snapshot.studySupervisor?.focus.key).toBe("endogenous_science_agenda");
    expect(state.experimentPlan?.focusKey).toBe("endogenous_science_agenda");
    expect(state.commitment?.kind).toBe("artifact");
    expect(state.livingState.internalProjectState.focusKey).toBe("endogenous_science_agenda");

    const persisted = JSON.parse(
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
      internalProjectState?: {
        focusKey?: string | null;
        recommendedAction?: string | null;
      };
    };

    expect(persisted.internalProjectState?.focusKey).toBe("endogenous_science_agenda");
    expect(persisted.internalProjectState?.recommendedAction).toContain("Empujar foco activo");
  });
});
