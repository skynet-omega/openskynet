import { describe, expect, it } from "vitest";
import { computeOmegaUtilityBreakdown, deriveOmegaBudgetUsage } from "./executive-utility.js";

describe("omega executive utility", () => {
  it("raises budget pressure when recent turns exhaust declared limits", () => {
    const usage = deriveOmegaBudgetUsage({
      operationalSignals: [
        {
          id: "1",
          recordedAt: 1,
          iteration: 1,
          terminationReason: "continue",
          turnHealth: "stalled",
          progressObserved: false,
          timelineDelta: 0,
          kernelUpdated: false,
          latencyBreakdown: {
            sendAgentTurnMs: 1,
            loadSnapshotMs: 1,
            readLatestReplyMs: 1,
            totalMs: 10_000,
          },
        },
        {
          id: "2",
          recordedAt: 2,
          iteration: 2,
          terminationReason: "continue",
          turnHealth: "stalled",
          progressObserved: false,
          timelineDelta: 0,
          kernelUpdated: false,
          latencyBreakdown: {
            sendAgentTurnMs: 1,
            loadSnapshotMs: 1,
            readLatestReplyMs: 1,
            totalMs: 10_000,
          },
        },
      ],
      maxTurnsPerCycle: 2,
      maxLlmCalls: 2,
      maxWallTimeMs: 15_000,
    });

    expect(usage.budgetPressure).toBeGreaterThan(0.95);
  });

  it("reduces total utility when cost and failure risk are high", () => {
    const lowCost = computeOmegaUtilityBreakdown({
      urgency: 0.8,
      expectedUtility: 0.7,
      uncertaintyReduction: 0.5,
      estimatedCost: 0.1,
      failureRisk: 0.1,
    });
    const highCost = computeOmegaUtilityBreakdown({
      urgency: 0.8,
      expectedUtility: 0.7,
      uncertaintyReduction: 0.5,
      estimatedCost: 0.8,
      failureRisk: 0.8,
    });

    expect(highCost.total).toBeLessThan(lowCost.total);
  });
});
