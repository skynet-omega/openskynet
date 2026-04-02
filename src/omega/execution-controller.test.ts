import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deriveOmegaExecutiveActionStopReason,
  deriveOmegaHeartbeatCorrectiveControl,
  syncOmegaExecutionControllerState,
  shouldDispatchOmegaHeartbeatPrompt,
} from "./execution-controller.js";
import { syncOmegaExecutiveObserverState } from "./executive-state.js";
import { recordOmegaSessionOutcome } from "./session-context.js";
import * as worldModel from "./world-model.js";

const tempDirs: string[] = [];

async function createWorkspaceRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "openskynet-omega-controller-"));
  tempDirs.push(root);
  return root;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    tempDirs.splice(0, tempDirs.length).map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
});

describe("omega execution controller", () => {
  it("suppresses heartbeat prompt when autonomy is idle and dispatch is deferred", () => {
    expect(
      shouldDispatchOmegaHeartbeatPrompt({
        dispatchPlan: {
          shouldDispatchLlmTurn: false,
          selectedAction: "idle",
          queueKind: "none",
          expectedUtility: 0,
          utilityBreakdown: {
            uncertaintyReduction: 0,
          } as any,
          budgetUsage: {
            observedTurns: 0,
            observedWallTimeMs: 0,
            budgetPressure: 0,
            estimatedLlmCalls: 0,
          } as any,
          estimatedDispatchCostMs: 0,
          queueDepths: { goals: 0, anomalies: 0, maintenance: 0 },
          scheduledItems: [],
          nextWakeDelayMs: 1000,
          deferReason: "no_action",
          rationale: [],
        },
        wakeAction: { kind: "heartbeat_ok", reason: "no_verified_tension" },
        shouldRunAutonomy: false,
      }),
    ).toBe(false);
  });

  it("allows heartbeat prompt when the executive plan explicitly selected work", () => {
    expect(
      shouldDispatchOmegaHeartbeatPrompt({
        dispatchPlan: {
          shouldDispatchLlmTurn: true,
          selectedAction: "maintain",
          queueKind: "maintenance",
          expectedUtility: 0.6,
          utilityBreakdown: {
            uncertaintyReduction: 0.2,
          } as any,
          budgetUsage: {
            observedTurns: 1,
            observedWallTimeMs: 1000,
            budgetPressure: 0.2,
            estimatedLlmCalls: 1,
          } as any,
          estimatedDispatchCostMs: 1500,
          queueDepths: { goals: 0, anomalies: 0, maintenance: 1 },
          scheduledItems: [],
          nextWakeDelayMs: 1000,
          rationale: [],
        },
        wakeAction: { kind: "heartbeat_ok", reason: "no_verified_tension" },
        shouldRunAutonomy: false,
      }),
    ).toBe(true);
  });

  it("promotes stalled review work into reframe control", () => {
    expect(
      deriveOmegaHeartbeatCorrectiveControl({
        wakeAction: {
          kind: "review_active_goal",
          reason: "verified_failure_requires_followup",
          goalTask: "patch file",
        },
        operationalSummary: {
          recentTurnCount: 3,
          recentStalledTurns: 2,
          recentResolvedTurns: 0,
          latestTurnHealth: "stalled",
          freshness: "fresh",
          averageCausalImpact: 0.1,
          latestCausalImpact: 0,
        },
      }),
    ).toMatchObject({
      kind: "reframe_stalled_goal",
    });
  });

  it("maps successful structured executive actions to structured idle stop", () => {
    expect(
      deriveOmegaExecutiveActionStopReason({
        resultKind: "resumed_interrupted_goal",
        status: "ok",
      }),
    ).toBe("structured_idle");
  });

  it("reuses the persisted executive world snapshot when no task-specific context is requested", async () => {
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

    const executiveState = await syncOmegaExecutiveObserverState({
      workspaceRoot,
      sessionKey: "agent:test:main",
    });
    const snapshotSpy = vi.spyOn(worldModel, "loadOmegaWorldModelSnapshot");

    const state = await syncOmegaExecutionControllerState({
      workspaceRoot,
      sessionKey: "agent:test:main",
      skipExecutiveSync: true,
      includeWorldSnapshot: true,
    });

    expect(snapshotSpy).not.toHaveBeenCalled();
    expect(state.worldSnapshot).toEqual(executiveState.sourceWorldSnapshot);
  });

  it("reloads the world snapshot when validation needs task-specific context", async () => {
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

    await syncOmegaExecutiveObserverState({
      workspaceRoot,
      sessionKey: "agent:test:main",
    });
    const snapshotSpy = vi.spyOn(worldModel, "loadOmegaWorldModelSnapshot");

    const state = await syncOmegaExecutionControllerState({
      workspaceRoot,
      sessionKey: "agent:test:main",
      skipExecutiveSync: true,
      includeWorldSnapshot: true,
      task: "validate src/app.ts",
      expectedPaths: ["src/app.ts"],
    });

    expect(snapshotSpy).toHaveBeenCalledTimes(1);
    expect(state.worldSnapshot?.sessionKey).toBe("agent:test:main");
  });
});
