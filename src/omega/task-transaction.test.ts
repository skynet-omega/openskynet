import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildOmegaSessionContextPrompt,
  loadOmegaTaskTransactions,
  recordOmegaSessionOutcome,
} from "./session-context.js";

describe("omega task transaction", () => {
  let workspaceRoot = "";
  const relativeTargetPath = "workspace/manual_code_probe/range_tools.py";

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openskynet-omega-transaction-"));
  });

  afterEach(async () => {
    if (workspaceRoot) {
      await fs.rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("records a reroute step after a validated omega_delegate false success", async () => {
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "main",
      task: "patch target file",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: [relativeTargetPath],
      },
      outcome: {
        status: "error",
        errorKind: "target_not_touched",
        observedChangedFiles: [],
        writeOk: false,
      },
      execution: {
        route: "omega_delegate",
        runId: "run-1",
        trigger: "direct",
      },
    });

    const transactions = await loadOmegaTaskTransactions({
      workspaceRoot,
      sessionKey: "main",
    });
    const prompt = await buildOmegaSessionContextPrompt({
      workspaceRoot,
      sessionKey: "main",
      task: "patch target file",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: [relativeTargetPath],
      },
    });

    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toMatchObject({
      status: "active",
      validation: {
        expectedPaths: [relativeTargetPath],
      },
      attempts: [
        expect.objectContaining({
          route: "omega_delegate",
          status: "error",
          errorKind: "target_not_touched",
          runId: "run-1",
          trigger: "direct",
        }),
      ],
      nextRecoveryStep: {
        kind: "reroute",
        reason: "verified_write_failure_after_restart",
        route: "sessions_spawn",
        remainingTargets: [relativeTargetPath],
        requiredKeys: [],
      },
    });
    expect(prompt).toContain("[OMEGA Task Transaction]");
    expect(prompt).toContain("Last transaction route: omega_delegate");
    expect(prompt).toContain("Next recovery route: sessions_spawn");
  });

  it("completes the same transaction after a successful heartbeat recovery", async () => {
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "main",
      task: "patch target file",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: [relativeTargetPath],
      },
      outcome: {
        status: "error",
        errorKind: "target_not_touched",
        observedChangedFiles: [],
        writeOk: false,
      },
      execution: {
        route: "omega_delegate",
        runId: "run-1",
        trigger: "direct",
      },
    });

    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "main",
      task: "patch target file",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: [relativeTargetPath],
      },
      outcome: {
        status: "ok",
        observedChangedFiles: [relativeTargetPath],
        writeOk: true,
      },
      execution: {
        route: "sessions_spawn",
        runId: "run-2",
        resumedFromKernel: true,
        trigger: "heartbeat",
      },
    });

    const transactions = await loadOmegaTaskTransactions({
      workspaceRoot,
      sessionKey: "main",
    });

    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toMatchObject({
      status: "completed",
      attempts: [
        expect.objectContaining({
          route: "omega_delegate",
          trigger: "direct",
        }),
        expect.objectContaining({
          route: "sessions_spawn",
          trigger: "heartbeat",
          resumedFromKernel: true,
          status: "ok",
          observedChangedFiles: [relativeTargetPath],
        }),
      ],
      nextRecoveryStep: {
        kind: "none",
        reason: "verified_success",
      },
    });
  });

  it("marks the transaction as aborted after repeated verified recovery failure", async () => {
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "main",
      task: "patch target file",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: [relativeTargetPath],
      },
      outcome: {
        status: "error",
        errorKind: "target_not_touched",
        observedChangedFiles: [],
        writeOk: false,
      },
      execution: {
        route: "omega_delegate",
        runId: "run-1",
        trigger: "direct",
      },
    });

    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "main",
      task: "patch target file",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: [relativeTargetPath],
      },
      outcome: {
        status: "error",
        errorKind: "target_not_touched",
        observedChangedFiles: [],
        writeOk: false,
      },
      execution: {
        route: "sessions_spawn",
        runId: "run-2",
        resumedFromKernel: true,
        trigger: "heartbeat",
      },
    });

    const transactions = await loadOmegaTaskTransactions({
      workspaceRoot,
      sessionKey: "main",
    });
    const prompt = await buildOmegaSessionContextPrompt({
      workspaceRoot,
      sessionKey: "main",
      task: "patch target file",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: [relativeTargetPath],
      },
    });

    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toMatchObject({
      status: "active",
      attempts: [
        expect.objectContaining({
          route: "omega_delegate",
          trigger: "direct",
        }),
        expect.objectContaining({
          route: "sessions_spawn",
          trigger: "heartbeat",
          resumedFromKernel: true,
          status: "error",
          errorKind: "target_not_touched",
        }),
      ],
      nextRecoveryStep: {
        kind: "abort",
        reason: "failure_streak_too_high",
        route: "sessions_spawn",
        remainingTargets: [relativeTargetPath],
        requiredKeys: [],
      },
    });
    expect(prompt).toContain("Next recovery step: abort (failure_streak_too_high)");
  });
});
