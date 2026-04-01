import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeAutonomousAction } from "./autonomous-executor.js";
import { syncOpenSkynetLivingMemory } from "./living-memory.js";
import { loadOmegaWorldModelSnapshot } from "./world-model.js";

describe("autonomous executor", () => {
  let workspaceRoot = "";
  const sessionKey = "agent:openskynet:main";

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "omega-autonomous-executor-"));
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it("proposes experiments from structured living memory instead of MEMORY.md", async () => {
    await fs.writeFile(
      path.join(workspaceRoot, "INTERNAL_PROJECT.json"),
      JSON.stringify(
        {
          key: "protein-lab",
          name: "Protein Lab",
          role: "Protein discovery project.",
          mission: "Find useful protein structures.",
          benchmarkPurpose: "Measure autonomous scientific progress.",
          successCriteria: ["produces a measurable artifact"],
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
      recommendedAction: "Design one measurable protein artifact.",
      commitment: {
        sessionKey,
        updatedAt: Date.now(),
        projectName: "Protein Lab",
        kind: "artifact",
        artifactKind: "module",
        targetFocusKey: "protein_structures",
        rationale: "Need one measurable artifact.",
        executableTask: "Generate one runnable protein search artifact.",
        confidence: 0.82,
      },
    });

    const result = await executeAutonomousAction({
      workspaceRoot,
      sessionKey,
      signal: {
        kind: "entropy_alert",
        silentMs: 90_000,
        reason: "test_entropy_alert",
        urgency: 0.9,
      },
      kernel: {
        identity: { continuityId: "c1" },
        turnCount: 1,
        tension: {
          openGoalCount: 0,
          failureStreak: 0,
          repeatedFailureKinds: [],
        },
        world: {
          lastOutcomeStatus: "nominal",
          lastErrorKind: undefined,
          lastObservedChangedFiles: [],
        },
        goals: [],
      } as never,
    });

    expect(result.kind).toBe("experiment_proposed");
    if (result.kind === "experiment_proposed") {
      expect(result.hypothesis).toContain("Protein Lab");
      expect(result.hypothesis).toContain("Generate one runnable protein search artifact");
    }
  });
});
