import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { syncOpenSkynetLivingMemory } from "./living-memory.js";
import { loadOpenSkynetOmegaRuntimeAuthority } from "./runtime-authority.js";
import { loadOmegaWorldModelSnapshot } from "./world-model.js";

describe("omega runtime authority", () => {
  let workspaceRoot = "";
  const sessionKey = "agent:openskynet:main";

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "omega-runtime-authority-"));
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it("loads project, living memory, decision context, and world snapshot from one entrypoint", async () => {
    await fs.writeFile(
      path.join(workspaceRoot, "INTERNAL_PROJECT.json"),
      JSON.stringify(
        {
          key: "protein-lab",
          name: "Protein Lab",
          role: "Protein discovery project.",
          mission: "Find useful protein structures.",
          benchmarkPurpose: "Measure sustained autonomous scientific work.",
          successCriteria: ["produces measurable artifacts"],
        },
        null,
        2,
      ),
      "utf-8",
    );

    const snapshot = await loadOmegaWorldModelSnapshot({
      workspaceRoot,
      sessionKey,
    });
    await syncOpenSkynetLivingMemory({
      workspaceRoot,
      sessionKey,
      snapshot,
      recommendedAction: "Produce one measurable protein artifact.",
    });

    const authority = await loadOpenSkynetOmegaRuntimeAuthority({
      workspaceRoot,
      sessionKey,
      includeWorldSnapshot: true,
      task: "Create a protein benchmark artifact",
      expectedPaths: ["src/protein-lab.ts"],
      watchedPaths: ["src/protein-lab.ts", "src/other.ts"],
    });

    expect(authority.project.name).toBe("Protein Lab");
    expect(authority.memoryCandidates[0]).toContain(".openskynet/living-memory/state/");
    expect(authority.decisionContext.policy).toBeDefined();
    expect(authority.livingState?.selfModel.internalProject.name).toBe("Protein Lab");
    expect(authority.worldSnapshot?.problemAgenda).toBeDefined();
  });

  it("derives the world snapshot through decision context when task-specific validation is present", async () => {
    const authority = await loadOpenSkynetOmegaRuntimeAuthority({
      workspaceRoot,
      sessionKey,
      task: "Create a protein benchmark artifact",
      expectedPaths: ["src/protein-lab.ts"],
      watchedPaths: ["src/protein-lab.ts", "src/other.ts"],
    });

    expect(authority.decisionContext.controllerState?.worldSnapshot).toBeDefined();
    expect(authority.worldSnapshot).toEqual(
      authority.decisionContext.controllerState?.worldSnapshot,
    );
  });
});
