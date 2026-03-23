import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadOmegaExecutiveState, syncOmegaExecutiveObserverState } from "./executive-state.js";
import { recordOmegaOperationalTurnMemory } from "./operational-memory.js";
import { recordOmegaSessionOutcome } from "./session-context.js";

const tempDirs: string[] = [];

async function createWorkspaceRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "openskynet-omega-executive-"));
  tempDirs.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0, tempDirs.length).map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
});

describe("omega executive state", () => {
  it("persists an observer snapshot after session outcomes", async () => {
    const workspaceRoot = await createWorkspaceRoot();
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "agent:test:main",
      task: "repair src/app.ts",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: ["src/app.ts"],
      },
      outcome: {
        status: "error",
        errorKind: "target_not_touched",
      },
    });

    const state = await loadOmegaExecutiveState({
      workspaceRoot,
      sessionKey: "agent:test:main",
    });

    expect(state?.observer.mode).toBe("active");
    expect(state?.observer.queue[0]?.task).toBe("repair src/app.ts");
    expect(state?.runtime.dispatchPlan.shouldDispatchLlmTurn).toBe(true);
    expect(state?.runtime.dispatchPlan.selectedAction).toBe("direct_execute");
    expect(state?.runtime.dispatchAccounting.totalCycles).toBe(1);
    expect(state?.runtime.dispatchAccounting.llmDispatches).toBe(1);
    expect(state?.runtime.dispatchAccounting.recentSelectedWorkItemIds).toHaveLength(1);
    expect(state?.runtime.dispatchAccounting.recentDispatchedWorkItemIds).toHaveLength(1);
  });

  it("switches to recovering when stalled operational memory and failures accumulate", async () => {
    const workspaceRoot = await createWorkspaceRoot();
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "agent:test:main",
      task: "repair src/app.ts",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: ["src/app.ts"],
      },
      outcome: {
        status: "error",
        errorKind: "missing_target_writes",
      },
    });
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "agent:test:main",
      task: "repair src/app.ts again",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: ["src/app.ts"],
      },
      outcome: {
        status: "error",
        errorKind: "missing_target_writes",
      },
    });
    await recordOmegaOperationalTurnMemory({
      workspaceRoot,
      sessionKey: "agent:test:main",
      turn: {
        iteration: 1,
        terminationReason: "continue",
        stateDelta: {
          timelineDelta: 0,
          kernelUpdated: false,
          progressObserved: false,
        },
        latencyBreakdown: {
          sendAgentTurnMs: 1,
          loadSnapshotMs: 1,
          readLatestReplyMs: 1,
          totalMs: 3,
        },
      },
      turnPolicy: {
        continueDelayMs: 7500,
        shouldBackoff: true,
        turnHealth: "stalled",
      },
    });
    await recordOmegaOperationalTurnMemory({
      workspaceRoot,
      sessionKey: "agent:test:main",
      turn: {
        iteration: 2,
        terminationReason: "continue",
        stateDelta: {
          timelineDelta: 0,
          kernelUpdated: false,
          progressObserved: false,
        },
        latencyBreakdown: {
          sendAgentTurnMs: 1,
          loadSnapshotMs: 1,
          readLatestReplyMs: 1,
          totalMs: 3,
        },
      },
      turnPolicy: {
        continueDelayMs: 7500,
        shouldBackoff: true,
        turnHealth: "stalled",
      },
    });

    const state = await syncOmegaExecutiveObserverState({
      workspaceRoot,
      sessionKey: "agent:test:main",
    });

    expect(state.observer.mode).toBe("recovering");
    expect(state.observer.decision.selectedAction).toBe("recover");
    expect(state.memory.health).toBe("stalled");
    expect(state.runtime.dispatchPlan.shouldDispatchLlmTurn).toBe(true);
    expect(state.runtime.dispatchPlan.selectedAction).toBe("recover");
    expect(state.runtime.dispatchAccounting.totalCycles).toBeGreaterThanOrEqual(1);
    expect(state.runtime.dispatchAccounting.llmDispatches).toBeGreaterThanOrEqual(1);
    expect(state.runtime.dispatchPlan.selectedWorkItemId).toBe("anomaly:repeated_failure");
  });

  it("reuses the executive state when sync inputs have not changed materially", async () => {
    const workspaceRoot = await createWorkspaceRoot();
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "agent:test:main",
      task: "repair src/app.ts",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: ["src/app.ts"],
      },
      outcome: {
        status: "ok",
        observedChangedFiles: ["src/app.ts"],
        writeOk: true,
      },
    });

    const first = await syncOmegaExecutiveObserverState({
      workspaceRoot,
      sessionKey: "agent:test:main",
    });
    const second = await syncOmegaExecutiveObserverState({
      workspaceRoot,
      sessionKey: "agent:test:main",
    });

    expect(second.syncFingerprint).toBe(first.syncFingerprint);
    expect(second.revision).toBe(first.revision);
    expect(second.updatedAt).toBe(first.updatedAt);
    expect(second.runtime.dispatchAccounting.totalCycles).toBe(
      first.runtime.dispatchAccounting.totalCycles,
    );
    expect(second.runtime.dispatchAccounting.llmDispatches).toBe(
      first.runtime.dispatchAccounting.llmDispatches,
    );
    expect(second.runtime.dispatchAccounting.recentSelectedWorkItemIds).toEqual(
      first.runtime.dispatchAccounting.recentSelectedWorkItemIds,
    );
  });
});
