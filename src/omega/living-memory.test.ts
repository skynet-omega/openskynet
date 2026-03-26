import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SkynetCommitmentDecision } from "../skynet/commitment-engine.js";
import type { SkynetExperimentPlan } from "../skynet/experiment-cycle.js";
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

    expect(state.skynet.focusKey).toBe("endogenous_science_agenda");
    expect(state.skynet.commitment?.kind).toBe("artifact");

    const persisted = JSON.parse(
      await fs.readFile(resolveOpenSkynetLivingStateFile({ workspaceRoot, sessionKey }), "utf-8"),
    ) as typeof state;
    expect(persisted.skynet.recommendedAction).toBe("Execute the top item");

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
});
