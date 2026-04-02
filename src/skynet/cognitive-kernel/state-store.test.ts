import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSkynetCognitiveKernelState } from "./min-kernel.js";
import {
  loadSkynetCognitiveKernelState,
  resolveSkynetCognitiveKernelStatePath,
  writeSkynetCognitiveKernelState,
} from "./state-store.js";

describe("skynet cognitive kernel state store", () => {
  let workspaceRoot = "";

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skynet-cognitive-state-"));
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it("persists and reloads kernel state", async () => {
    const state = createSkynetCognitiveKernelState({ featureDimensions: 22 });
    state.observedCount = 4;
    state.prototypeCounts.progress = 2;
    state.lastObservedLabel = "progress";
    state.seenSampleIds = ["s1", "s2"];

    await writeSkynetCognitiveKernelState({
      workspaceRoot,
      sessionKey: "agent:openskynet:main",
      state,
    });

    expect(
      await fs.readFile(
        resolveSkynetCognitiveKernelStatePath(workspaceRoot, "agent:openskynet:main"),
        "utf-8",
      ),
    ).toContain('"observedCount": 4');

    const loaded = await loadSkynetCognitiveKernelState({
      workspaceRoot,
      sessionKey: "agent:openskynet:main",
    });

    expect(loaded?.observedCount).toBe(4);
    expect(loaded?.prototypeCounts.progress).toBe(2);
    expect(loaded?.lastObservedLabel).toBe("progress");
    expect(loaded?.seenSampleIds).toEqual(["s1", "s2"]);
  });
});
