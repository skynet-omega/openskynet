import { describe, expect, it } from "vitest";
import { summarizeOmegaMemoryOrchestration } from "./memory-orchestrator.js";

describe("summarizeOmegaMemoryOrchestration", () => {
  it("flags stalled health when recent operational turns are stalled", () => {
    const summary = summarizeOmegaMemoryOrchestration({
      durableMemory: [
        {
          id: "a",
          kind: "verified_success",
          task: "fix app",
          targets: ["src/app.ts"],
          observedChangedFiles: ["src/app.ts"],
          successCount: 2,
          failureCount: 0,
          firstSeenAt: 1,
          lastSeenAt: 2,
          lastOutcomeStatus: "ok",
        },
      ],
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
            totalMs: 3,
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
            totalMs: 3,
          },
        },
      ],
    });

    expect(summary.health).toBe("stalled");
    expect(summary.promotionCandidates).toBe(1);
  });
});
