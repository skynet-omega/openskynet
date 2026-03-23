import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  deriveOmegaAgendaExecutionContract,
  markOmegaProblemAgendaItemActivated,
  loadOmegaProblemAgenda,
  syncOmegaProblemAgenda,
} from "./problem-agenda.js";

describe("omega problem agenda", () => {
  it("derives a concrete execution contract for initiative agenda lines", () => {
    const contract = deriveOmegaAgendaExecutionContract("initiative:autonomy_improvement");
    expect(contract.hypothesis).toContain("autonomy improvement");
    expect(contract.deliverable).toContain("measurable");
    expect(contract.successCriteria).toContain("concrete change");
  });

  let workspaceRoot = "";
  const sessionKey = "agent:test:main";

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "omega-problem-agenda-"));
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it("marks an activated agenda line as resolved when the triggering evidence disappears", async () => {
    await syncOmegaProblemAgenda({
      workspaceRoot,
      sessionKey,
      kernel: {
        revision: 2,
        sessionKey,
        turnCount: 1,
        identity: { continuityId: "c1", firstSeenAt: 1, lastSeenAt: 1 },
        world: { lastObservedChangedFiles: [] },
        goals: [],
        tension: {
          openGoalCount: 0,
          staleGoalCount: 0,
          failureStreak: 0,
          repeatedFailureKinds: [],
          pendingCorrection: false,
        },
        causalGraph: { files: [], edges: [] },
        updatedAt: 1,
      },
      durableMemory: [],
      operationalSignals: [],
    });
    await markOmegaProblemAgendaItemActivated({
      workspaceRoot,
      sessionKey,
      classKey: "initiative:autonomy_improvement",
    });

    await syncOmegaProblemAgenda({
      workspaceRoot,
      sessionKey,
      kernel: {
        revision: 2,
        sessionKey,
        turnCount: 2,
        identity: { continuityId: "c1", firstSeenAt: 1, lastSeenAt: 2 },
        world: { lastObservedChangedFiles: [] },
        goals: [
          {
            id: "goal-1",
            task: "real work now exists",
            targets: ["src/a.ts"],
            requiredKeys: [],
            status: "active",
            createdAt: 2,
            updatedAt: 2,
            createdTurn: 2,
            updatedTurn: 2,
            failureCount: 0,
            successCount: 0,
            observedChangedFiles: [],
          },
        ],
        activeGoalId: "goal-1",
        tension: {
          openGoalCount: 1,
          staleGoalCount: 0,
          failureStreak: 0,
          repeatedFailureKinds: [],
          pendingCorrection: false,
        },
        causalGraph: { files: [], edges: [] },
        updatedAt: 2,
      },
      durableMemory: [],
      operationalSignals: [],
    });

    const items = await loadOmegaProblemAgenda({ workspaceRoot, sessionKey });
    const item = items.find((entry) => entry.classKey === "initiative:autonomy_improvement");
    expect(item).toMatchObject({
      status: "resolved",
      successCount: 1,
    });
    expect(item?.realizedUtility ?? 0).toBeGreaterThan(0);
  });

  it("dormants a repeatedly low-yield agenda line after enough failures", async () => {
    await syncOmegaProblemAgenda({
      workspaceRoot,
      sessionKey,
      kernel: undefined,
      durableMemory: [],
      operationalSignals: [
        {
          id: "turn-1",
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
            readLatestReplyMs: 0,
            totalMs: 2,
          },
        },
        {
          id: "turn-2",
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
            readLatestReplyMs: 0,
            totalMs: 2,
          },
        },
      ],
    });

    for (let i = 0; i < 2; i += 1) {
      await markOmegaProblemAgendaItemActivated({
        workspaceRoot,
        sessionKey,
        classKey: "initiative:stalled_progress",
      });
      await syncOmegaProblemAgenda({
        workspaceRoot,
        sessionKey,
        kernel: undefined,
        durableMemory: [],
        operationalSignals: [
          {
            id: `turn-a-${i}`,
            recordedAt: 3 + i * 2,
            iteration: 3 + i * 2,
            terminationReason: "continue",
            turnHealth: "stalled",
            progressObserved: false,
            timelineDelta: 0,
            kernelUpdated: false,
            latencyBreakdown: {
              sendAgentTurnMs: 1,
              loadSnapshotMs: 1,
              readLatestReplyMs: 0,
              totalMs: 2,
            },
          },
          {
            id: `turn-b-${i}`,
            recordedAt: 4 + i * 2,
            iteration: 4 + i * 2,
            terminationReason: "continue",
            turnHealth: "stalled",
            progressObserved: false,
            timelineDelta: 0,
            kernelUpdated: false,
            latencyBreakdown: {
              sendAgentTurnMs: 1,
              loadSnapshotMs: 1,
              readLatestReplyMs: 0,
              totalMs: 2,
            },
          },
        ],
      });
    }

    const items = await loadOmegaProblemAgenda({ workspaceRoot, sessionKey });
    const item = items.find((entry) => entry.classKey === "initiative:stalled_progress");
    expect(item).toMatchObject({
      status: "dormant",
      failureCount: 2,
    });
    expect(item?.priority ?? 1).toBeLessThanOrEqual(0.16);
  });

  it("penalizes an activated agenda line when the same stalled evidence persists", async () => {
    await syncOmegaProblemAgenda({
      workspaceRoot,
      sessionKey,
      kernel: undefined,
      durableMemory: [],
      operationalSignals: [
        {
          id: "turn-1",
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
            readLatestReplyMs: 0,
            totalMs: 2,
          },
        },
        {
          id: "turn-2",
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
            readLatestReplyMs: 0,
            totalMs: 2,
          },
        },
      ],
    });
    await markOmegaProblemAgendaItemActivated({
      workspaceRoot,
      sessionKey,
      classKey: "initiative:stalled_progress",
    });

    await syncOmegaProblemAgenda({
      workspaceRoot,
      sessionKey,
      kernel: undefined,
      durableMemory: [],
      operationalSignals: [
        {
          id: "turn-3",
          recordedAt: 3,
          iteration: 3,
          terminationReason: "continue",
          turnHealth: "stalled",
          progressObserved: false,
          timelineDelta: 0,
          kernelUpdated: false,
          latencyBreakdown: {
            sendAgentTurnMs: 1,
            loadSnapshotMs: 1,
            readLatestReplyMs: 0,
            totalMs: 2,
          },
        },
        {
          id: "turn-4",
          recordedAt: 4,
          iteration: 4,
          terminationReason: "continue",
          turnHealth: "stalled",
          progressObserved: false,
          timelineDelta: 0,
          kernelUpdated: false,
          latencyBreakdown: {
            sendAgentTurnMs: 1,
            loadSnapshotMs: 1,
            readLatestReplyMs: 0,
            totalMs: 2,
          },
        },
      ],
    });

    const items = await loadOmegaProblemAgenda({ workspaceRoot, sessionKey });
    const item = items.find((entry) => entry.classKey === "initiative:stalled_progress");
    expect(item).toMatchObject({
      status: "active",
      failureCount: 1,
    });
    expect(item?.realizedUtility ?? 0).toBeLessThan(0);
  });
});
