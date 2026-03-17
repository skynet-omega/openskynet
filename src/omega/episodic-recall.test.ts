import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildOmegaInteractionPrompt } from "./interaction-model.js";
import {
  buildOmegaSessionContextPrompt,
  recordOmegaSessionOutcome,
} from "./session-context.js";
import { loadOmegaRecoveryEpisodeRecall } from "./episodic-recall.js";

describe("omega episodic recall", () => {
  let workspaceRoot = "";
  const relPath = "workspace/docker/fix.ts";

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openskynet-omega-episodic-"));
  });

  afterEach(async () => {
    if (workspaceRoot) {
      await fs.rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("retrieves the most relevant prior recovery episode across sessions", async () => {
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "agent:worker-a:main",
      task: "arregla race condition de docker",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: [relPath],
      },
      outcome: {
        status: "error",
        errorKind: "target_not_touched",
        observedChangedFiles: [],
        writeOk: false,
      },
      execution: {
        route: "omega_delegate",
        runId: "run-a1",
        trigger: "direct",
      },
    });
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "agent:worker-a:main",
      task: "arregla race condition de docker",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: [relPath],
      },
      outcome: {
        status: "ok",
        observedChangedFiles: [relPath],
        writeOk: true,
      },
      execution: {
        route: "sessions_spawn",
        runId: "run-a2",
        resumedFromKernel: true,
        trigger: "heartbeat",
      },
    });

    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "agent:worker-b:main",
      task: "valida payload de slack",
      validation: {
        expectsJson: true,
        expectedKeys: ["status"],
        expectedPaths: [],
      },
      outcome: {
        status: "error",
        errorKind: "invalid_structured_result",
        observedChangedFiles: [],
        structuredOk: false,
      },
      execution: {
        route: "omega_delegate",
        runId: "run-b1",
        trigger: "direct",
      },
    });

    const episodes = await loadOmegaRecoveryEpisodeRecall({
      workspaceRoot,
      sessionKey: "main",
      task: "corrige la race condition en docker",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: [relPath],
      },
      errorKind: "target_not_touched",
    });

    expect(episodes).not.toHaveLength(0);
    expect(episodes[0]).toMatchObject({
      sessionKey: "agent:worker-a:main",
      task: "arregla race condition de docker",
      status: "completed",
      errorKind: "target_not_touched",
      lastRoute: "sessions_spawn",
      targets: [relPath],
      observedChangedFiles: [relPath],
    });
    expect(episodes[0]?.score ?? 0).toBeGreaterThan(0.5);
  });

  it("injects similar prior episodes into omega prompts", async () => {
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "agent:worker-a:main",
      task: "arregla race condition de docker",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: [relPath],
      },
      outcome: {
        status: "error",
        errorKind: "target_not_touched",
        observedChangedFiles: [],
        writeOk: false,
      },
      execution: {
        route: "omega_delegate",
        runId: "run-a1",
        trigger: "direct",
      },
    });
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "agent:worker-a:main",
      task: "arregla race condition de docker",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: [relPath],
      },
      outcome: {
        status: "ok",
        observedChangedFiles: [relPath],
        writeOk: true,
      },
      execution: {
        route: "sessions_spawn",
        runId: "run-a2",
        resumedFromKernel: true,
        trigger: "heartbeat",
      },
    });

    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "main",
      task: "corrige la race condition en docker",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: [relPath],
      },
      outcome: {
        status: "error",
        errorKind: "target_not_touched",
        observedChangedFiles: [],
        writeOk: false,
      },
      execution: {
        route: "omega_delegate",
        runId: "run-main-1",
        trigger: "direct",
      },
    });

    const sessionPrompt = await buildOmegaSessionContextPrompt({
      workspaceRoot,
      sessionKey: "main",
      task: "corrige la race condition en docker",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: [relPath],
      },
    });
    const interactionPrompt = await buildOmegaInteractionPrompt({
      workspaceRoot,
      sessionKey: "main",
      task: "corrige la race condition en docker",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: [relPath],
      },
    });

    expect(sessionPrompt).toContain("[OMEGA Similar Episodes]");
    expect(sessionPrompt).toContain("task=arregla race condition de docker");
    expect(sessionPrompt).toContain("route=sessions_spawn");
    expect(interactionPrompt).toContain("[OMEGA Similar Episodes]");
    expect(interactionPrompt).toContain("next=none");
  });
});
