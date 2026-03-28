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
    await fs.writeFile(
      path.join(workspaceRoot, "INTERNAL_PROJECT.json"),
      JSON.stringify(
        {
          key: "protein-lab",
          name: "Protein Lab",
          role: "Protein discovery project.",
          mission: "Find useful protein structures.",
          benchmarkPurpose: "Measure autonomous scientific continuity.",
          successCriteria: ["produces measurable protein artifacts"],
        },
        null,
        2,
      ),
      "utf-8",
    );

    const state = await syncOpenSkynetRuntimeAuthority({
      workspaceRoot,
      sessionKey: "agent:openskynet:main",
    });

    expect(state.project.name).toBe("Protein Lab");
    expect(state.snapshot.studySupervisor?.focus.key).toBe("endogenous_science_agenda");
    expect(state.experimentPlan?.focusKey).toBe("endogenous_science_agenda");
    expect(state.commitment?.kind).toBe("artifact");
    expect(state.livingState.internalProjectState.focusKey).toBe("endogenous_science_agenda");
    expect(state.snapshot.skynetNucleus?.name).toBe("Protein Lab");

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
