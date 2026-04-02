import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SkynetCommitmentDecision, SkynetExperimentPlan } from "./internal-project-lab.js";
import {
  collectOpenSkynetMemoryCandidates,
  planOpenSkynetMemoryReset,
  resolveOpenSkynetLivingHistoryFile,
  resolveOpenSkynetLivingStateFile,
  syncOpenSkynetLivingMemory,
} from "./living-memory.js";
import { loadOmegaWorldModelSnapshot } from "./world-model.js";

describe("omega living memory", () => {
  let workspaceRoot = "";
  const sessionKey = "agent:openskynet:main";

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "omega-living-memory-"));
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it("persists structured living state and appends initialization history", async () => {
    const snapshot = await loadOmegaWorldModelSnapshot({
      workspaceRoot,
      sessionKey,
    });
    const experiment: SkynetExperimentPlan = {
      sessionKey,
      updatedAt: Date.now(),
      projectName: "Skynet",
      focusKey: "endogenous_science_agenda",
      mode: "explore",
      hypothesis: "h",
      deliverable: "d",
      killCriteria: "k",
      benchmarkHook: "b",
      notes: [],
    };
    const commitment: SkynetCommitmentDecision = {
      sessionKey,
      updatedAt: Date.now(),
      projectName: "Skynet",
      kind: "artifact",
      artifactKind: "module",
      targetFocusKey: "endogenous_science_agenda",
      rationale: "r",
      executableTask: "e",
      confidence: 0.81,
    };

    const state = await syncOpenSkynetLivingMemory({
      workspaceRoot,
      sessionKey,
      snapshot,
      recommendedAction: "Execute the top item",
      experiment,
      commitment,
    });

    expect(state.internalProjectState.focusKey).toBe("endogenous_science_agenda");
    expect(state.internalProjectState.commitment?.kind).toBe("artifact");
    expect(state.selfModel.platform.name).toBe("OpenSkyNet");
    expect(state.selfModel.internalProject.name).toBe("Skynet");
    expect(state.skynet.name).toBe("Skynet");
    expect(state.selfModel.reporting.separatePlatformFromInternalProject).toBe(true);
    expect(state.selfModel.reporting.internalProjectFindingsMustTransferToKernel).toBe(true);
    expect(state.selfModel.reporting.internalProjectMustNotBeKernelDependency).toBe(true);
    expect(state.agenticBenchmark.projectKey).toBe("skynet");
    expect(state.agenticBenchmark.benchmarkScore).toBeGreaterThan(0);

    const persisted = JSON.parse(
      await fs.readFile(resolveOpenSkynetLivingStateFile({ workspaceRoot, sessionKey }), "utf-8"),
    ) as typeof state;
    expect(persisted.internalProjectState.recommendedAction).toBe("Execute the top item");
    expect(persisted.selfModel.reporting.maintenanceIsNotProjectProgress).toBe(true);
    expect(persisted.selfModel.reporting.internalProjectMustNotBeKernelDependency).toBe(true);

    const historyLines = (
      await fs.readFile(resolveOpenSkynetLivingHistoryFile(workspaceRoot), "utf-8")
    )
      .trim()
      .split("\n");
    expect(historyLines).toHaveLength(1);
    expect(JSON.parse(historyLines[0] ?? "{}")).toMatchObject({
      kind: "runtime_initialized",
      sessionKey,
    });
  });

  it("prioritizes structured state in memory candidates and plans reset targets", async () => {
    const snapshot = await loadOmegaWorldModelSnapshot({
      workspaceRoot,
      sessionKey,
    });
    await syncOpenSkynetLivingMemory({
      workspaceRoot,
      sessionKey,
      snapshot,
    });
    await fs.mkdir(path.join(workspaceRoot, "memory"), { recursive: true });
    await fs.writeFile(path.join(workspaceRoot, "memory", "SKYNET_PULSE.md"), "# pulse\n", "utf-8");

    const candidates = await collectOpenSkynetMemoryCandidates(workspaceRoot);
    expect(candidates[0]).toContain(".openskynet/living-memory/state/");
    expect(candidates).toContain("memory/SKYNET_PULSE.md");

    const resetTargets = await planOpenSkynetMemoryReset({
      workspaceRoot,
      includeHumanReadable: true,
    });
    expect(resetTargets.some((item) => item.endsWith("living-memory"))).toBe(true);
    expect(resetTargets.some((item) => item.endsWith(path.join("memory", "SKYNET_PULSE.md")))).toBe(
      true,
    );
  });

  it("loads the internal project profile from config instead of hardcoding Skynet semantics", async () => {
    await fs.writeFile(
      path.join(workspaceRoot, "INTERNAL_PROJECT.json"),
      JSON.stringify(
        {
          key: "protein-lab",
          name: "Protein Lab",
          role: "Protein folding discovery program.",
          mission: "Search for useful protein structures autonomously.",
          benchmarkPurpose: "Measure whether OpenSkyNet can sustain scientific work on proteins.",
          successCriteria: ["produces measurable protein artifacts"],
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
    const state = await syncOpenSkynetLivingMemory({
      workspaceRoot,
      sessionKey,
      snapshot,
    });

    expect(state.selfModel.internalProject.key).toBe("protein-lab");
    expect(state.selfModel.internalProject.name).toBe("Protein Lab");
    expect(state.agenticBenchmark.projectName).toBe("Protein Lab");
    expect(state.skynet.name).toBe("Protein Lab");
  });

  it("marks living memory as degraded when the world model snapshot has degraded components", async () => {
    const healthySnapshot = await loadOmegaWorldModelSnapshot({
      workspaceRoot,
      sessionKey,
    });
    const degradedSnapshot = {
      ...healthySnapshot,
      degradedComponents: [{ component: "study_supervisor", reason: "boom" }],
    };

    const healthyState = await syncOpenSkynetLivingMemory({
      workspaceRoot,
      sessionKey,
      snapshot: healthySnapshot,
      recommendedAction: "Execute the top item",
    });

    const degradedState = await syncOpenSkynetLivingMemory({
      workspaceRoot,
      sessionKey,
      snapshot: degradedSnapshot,
      recommendedAction: "Execute the top item",
    });

    expect(degradedState.authority).toMatchObject({
      worldModelStatus: "degraded",
      degradedComponents: ["study_supervisor"],
    });
    expect(healthyState.authority.worldModelStatus).toBe("healthy");
    expect(degradedState.agenticBenchmark.benchmarkScore).toBeLessThan(
      healthyState.agenticBenchmark.benchmarkScore,
    );
  });

  it("persists operational memory freshness in living authority state", async () => {
    const snapshot = await loadOmegaWorldModelSnapshot({
      workspaceRoot,
      sessionKey,
    });

    const state = await syncOpenSkynetLivingMemory({
      workspaceRoot,
      sessionKey,
      snapshot,
      operationalSummary: {
        recentTurnCount: 2,
        recentStalledTurns: 1,
        recentResolvedTurns: 1,
        latestTurnHealth: "resolved",
        latestRecordedAt: 12345,
        ageMs: 3 * 60 * 60 * 1000,
        freshness: "stale",
        averageCausalImpact: 0.5,
        latestCausalImpact: 1,
      },
    });

    expect(state.authority).toMatchObject({
      operationalMemoryStatus: "stale",
      operationalMemoryLatestAt: 12345,
    });
  });
});
