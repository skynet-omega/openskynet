import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveOmegaCognitiveKernelArtifactPath } from "./cognitive-kernel.js";
import { syncOpenSkynetLivingMemory } from "./living-memory.js";
import { loadOpenSkynetOmegaRuntimeAuthority } from "./runtime-authority.js";
import { resolveOmegaRuntimeObserverArtifactPath } from "./runtime-observer.js";
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

  it("loads a fresh runtime observer signal only when the lab artifact passes thresholds", async () => {
    await fs.mkdir(path.dirname(resolveOmegaRuntimeObserverArtifactPath(workspaceRoot)), {
      recursive: true,
    });
    await fs.writeFile(
      resolveOmegaRuntimeObserverArtifactPath(workspaceRoot),
      JSON.stringify(
        {
          updatedAt: Date.now(),
          status: "pass",
          accuracy: 0.82,
          majorityBaseline: 0.7,
          improvementOverBaseline: 0.12,
          trajectorySamples: 95,
          harvestedEpisodes: 97,
          lookback: 3,
          labelCoverage: { stall: 67, damage: 15, progress: 9, relief: 2, frustration: 2 },
        },
        null,
        2,
      ),
      "utf-8",
    );

    const authority = await loadOpenSkynetOmegaRuntimeAuthority({
      workspaceRoot,
      sessionKey,
    });

    expect(authority.runtimeObserver?.freshness).toBe("fresh");
    expect(authority.runtimeObserver?.improvementOverBaseline).toBeGreaterThanOrEqual(0.08);
    expect(authority.runtimeObserver?.dominantLabel).toBe("stall");
  });

  it("promotes a fresh cognitive kernel signal as active by default and auto-disables below 0.80", async () => {
    await fs.mkdir(path.dirname(resolveOmegaCognitiveKernelArtifactPath(workspaceRoot)), {
      recursive: true,
    });
    await fs.writeFile(
      resolveOmegaCognitiveKernelArtifactPath(workspaceRoot),
      JSON.stringify(
        {
          updatedAt: Date.now(),
          status: "pass",
          accuracy: 0.86,
          majorityBaseline: 0.55,
          improvementOverBaseline: 0.31,
          trajectorySamples: 87,
          harvestedEpisodes: 91,
          evaluatedSamples: 79,
          warmupSamples: 8,
          labelCoverage: { stall: 48, damage: 15, relief: 15, progress: 9 },
        },
        null,
        2,
      ),
      "utf-8",
    );

    const activeAuthority = await loadOpenSkynetOmegaRuntimeAuthority({
      workspaceRoot,
      sessionKey,
    });

    expect(activeAuthority.cognitiveKernel?.freshness).toBe("fresh");
    expect(activeAuthority.cognitiveKernel?.active).toBe(true);
    expect(activeAuthority.cognitiveKernel?.activationReason).toBe("enabled_by_default");
    expect(activeAuthority.cognitiveKernel?.deactivationThreshold).toBe(0.8);

    await fs.writeFile(
      resolveOmegaCognitiveKernelArtifactPath(workspaceRoot),
      JSON.stringify(
        {
          updatedAt: Date.now(),
          status: "pass",
          accuracy: 0.79,
          majorityBaseline: 0.55,
          improvementOverBaseline: 0.24,
          trajectorySamples: 87,
          harvestedEpisodes: 91,
          evaluatedSamples: 79,
          warmupSamples: 8,
          labelCoverage: { stall: 48, damage: 15, relief: 15, progress: 9 },
        },
        null,
        2,
      ),
      "utf-8",
    );

    const disabledAuthority = await loadOpenSkynetOmegaRuntimeAuthority({
      workspaceRoot,
      sessionKey,
    });

    expect(disabledAuthority.cognitiveKernel?.active).toBe(false);
    expect(disabledAuthority.cognitiveKernel?.activationReason).toBe("deactivated_accuracy");
  });
});
