import { describe, expect, it } from "vitest";
import {
  deriveOmegaExecutiveActionStopReason,
  deriveOmegaHeartbeatCorrectiveControl,
  shouldDispatchOmegaHeartbeatPrompt,
} from "./execution-controller.js";

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
});
