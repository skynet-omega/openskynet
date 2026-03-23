import { describe, expect, it } from "vitest";
import { observeOmegaExecutiveState } from "./executive-arbitration.js";
import {
  deriveNextOmegaExecutiveDispatchAccounting,
  deriveOmegaExecutiveDispatchPlan,
} from "./executive-runtime.js";
import type { OmegaMemoryOrchestratorSummary } from "./memory-orchestrator.js";
import type { OmegaWorldModelSnapshot } from "./world-model.js";

function makeSnapshot(overrides: Partial<OmegaWorldModelSnapshot> = {}): OmegaWorldModelSnapshot {
  return {
    sessionKey: "agent:test:main",
    timelineLength: 0,
    relevantMemories: [],
    operationalSignals: [],
    problemAgenda: [],
    ...overrides,
  };
}

function makeMemory(
  overrides: Partial<OmegaMemoryOrchestratorSummary> = {},
): OmegaMemoryOrchestratorSummary {
  return {
    health: "stable",
    promotionCandidates: 0,
    revalidationCandidates: 0,
    repeatedFailurePatterns: [],
    recentUsefulSuccesses: 0,
    ...overrides,
  };
}

describe("deriveOmegaExecutiveDispatchPlan", () => {
  it("dispatches recovery work immediately", () => {
    const observer = observeOmegaExecutiveState({
      snapshot: makeSnapshot({
        kernel: {
          revision: 2,
          sessionKey: "agent:test:main",
          turnCount: 2,
          identity: { continuityId: "c1", firstSeenAt: 1, lastSeenAt: 2 },
          world: { lastObservedChangedFiles: [] },
          goals: [
            {
              id: "goal-1",
              task: "repair app",
              targets: ["src/app.ts"],
              requiredKeys: [],
              status: "active",
              createdAt: 1,
              updatedAt: 2,
              createdTurn: 1,
              updatedTurn: 2,
              failureCount: 2,
              successCount: 0,
              observedChangedFiles: [],
            },
          ],
          tension: {
            openGoalCount: 1,
            staleGoalCount: 0,
            failureStreak: 2,
            repeatedFailureKinds: ["target_not_touched"],
            pendingCorrection: true,
          },
          causalGraph: { files: [], edges: [] },
          updatedAt: 2,
        },
      }),
      memory: makeMemory(),
    });

    const plan = deriveOmegaExecutiveDispatchPlan({ observer });

    expect(plan.shouldDispatchLlmTurn).toBe(true);
    expect(plan.selectedAction).toBe("recover");
    expect(plan.queueKind).toBe("anomaly");
    expect(plan.nextWakeDelayMs).toBe(1000);
    expect(plan.queueDepths.goals).toBe(1);
    expect(plan.selectedWorkItemId).toBe("anomaly:repeated_failure");
    expect(plan.dispatchedWorkItemId).toBe("anomaly:repeated_failure");
    expect(plan.expectedUtility).toBeGreaterThan(0);
    expect(plan.estimatedDispatchCostMs).toBe(0);
    expect(plan.scheduledItems.some((item) => item.queueKind === "anomaly")).toBe(true);
  });

  it("defers maintenance-only work without dispatching an LLM turn", () => {
    const observer = observeOmegaExecutiveState({
      snapshot: makeSnapshot(),
      memory: makeMemory({
        revalidationCandidates: 2,
        health: "needs_revalidation",
      }),
    });

    const plan = deriveOmegaExecutiveDispatchPlan({ observer });

    expect(plan.shouldDispatchLlmTurn).toBe(false);
    expect(plan.selectedAction).toBe("maintain");
    expect(plan.queueKind).toBe("maintenance");
    expect(plan.deferReason).toBe("maintenance_only");
  });

  it("tracks dispatch accounting across cycles", () => {
    const observer = observeOmegaExecutiveState({
      snapshot: makeSnapshot({
        kernel: {
          revision: 2,
          sessionKey: "agent:test:main",
          turnCount: 1,
          identity: { continuityId: "c1", firstSeenAt: 1, lastSeenAt: 1 },
          world: { lastObservedChangedFiles: [] },
          goals: [
            {
              id: "goal-1",
              task: "repair app",
              targets: ["src/app.ts"],
              requiredKeys: [],
              status: "active",
              createdAt: 1,
              updatedAt: 1,
              createdTurn: 1,
              updatedTurn: 1,
              failureCount: 0,
              successCount: 0,
              observedChangedFiles: [],
            },
          ],
          tension: {
            openGoalCount: 1,
            staleGoalCount: 0,
            failureStreak: 0,
            repeatedFailureKinds: [],
            pendingCorrection: true,
          },
          causalGraph: { files: [], edges: [] },
          updatedAt: 1,
        },
      }),
      memory: makeMemory(),
    });

    const plan = deriveOmegaExecutiveDispatchPlan({ observer });
    const accounting = deriveNextOmegaExecutiveDispatchAccounting({ plan });

    expect(accounting.totalCycles).toBe(1);
    expect(accounting.llmDispatches).toBe(1);
    expect(accounting.queueDispatchCounts.goal).toBe(1);
    expect(accounting.recentSelectedWorkItemIds[0]).toBe(plan.selectedWorkItemId);
    expect(accounting.recentDispatchedWorkItemIds[0]).toBe(plan.dispatchedWorkItemId);
    expect(accounting.workItemLedger[0]?.state).toBe("dispatched");
    expect(accounting.workItemLedger[0]?.llmCalls).toBe(1);
    expect(accounting.workItemLedger[0]?.cumulativeExpectedUtility).toBeGreaterThan(0);
  });

  it("marks vanished work items as completed when they leave the schedule", () => {
    const activeObserver = observeOmegaExecutiveState({
      snapshot: makeSnapshot({
        kernel: {
          revision: 2,
          sessionKey: "agent:test:main",
          turnCount: 1,
          identity: { continuityId: "c1", firstSeenAt: 1, lastSeenAt: 1 },
          world: { lastObservedChangedFiles: [] },
          goals: [
            {
              id: "goal-1",
              task: "repair app",
              targets: ["src/app.ts"],
              requiredKeys: [],
              status: "active",
              createdAt: 1,
              updatedAt: 1,
              createdTurn: 1,
              updatedTurn: 1,
              failureCount: 0,
              successCount: 0,
              observedChangedFiles: [],
            },
          ],
          tension: {
            openGoalCount: 1,
            staleGoalCount: 0,
            failureStreak: 0,
            repeatedFailureKinds: [],
            pendingCorrection: true,
          },
          causalGraph: { files: [], edges: [] },
          updatedAt: 1,
        },
      }),
      memory: makeMemory(),
    });
    const activePlan = deriveOmegaExecutiveDispatchPlan({ observer: activeObserver });
    const firstAccounting = deriveNextOmegaExecutiveDispatchAccounting({ plan: activePlan });

    const idleObserver = observeOmegaExecutiveState({
      snapshot: makeSnapshot(),
      memory: makeMemory(),
    });
    const idlePlan = deriveOmegaExecutiveDispatchPlan({
      observer: idleObserver,
      previousAccounting: firstAccounting,
    });
    const secondAccounting = deriveNextOmegaExecutiveDispatchAccounting({
      previousAccounting: firstAccounting,
      plan: idlePlan,
    });

    const goalLedger = secondAccounting.workItemLedger.find(
      (entry) => entry.itemId === "goal:goal-1",
    );
    expect(goalLedger?.state).toBe("completed");
    expect(goalLedger?.lastCompletedAtCycle).toBe(2);
  });

  it("escalates repeated low-yield direct execution into recovery when a stalled anomaly is present", () => {
    const observer = observeOmegaExecutiveState({
      snapshot: makeSnapshot({
        kernel: {
          revision: 2,
          sessionKey: "agent:test:main",
          turnCount: 4,
          identity: { continuityId: "c1", firstSeenAt: 1, lastSeenAt: 4 },
          world: { lastObservedChangedFiles: [] },
          goals: [
            {
              id: "goal-1",
              task: "repair app",
              targets: ["src/app.ts"],
              requiredKeys: [],
              status: "active",
              createdAt: 1,
              updatedAt: 4,
              createdTurn: 1,
              updatedTurn: 4,
              failureCount: 1,
              successCount: 0,
              observedChangedFiles: [],
            },
          ],
          tension: {
            openGoalCount: 1,
            staleGoalCount: 0,
            failureStreak: 0,
            repeatedFailureKinds: [],
            pendingCorrection: true,
          },
          causalGraph: { files: [], edges: [] },
          updatedAt: 4,
        },
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
              sendAgentTurnMs: 10,
              loadSnapshotMs: 10,
              readLatestReplyMs: 0,
              totalMs: 20,
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
              sendAgentTurnMs: 10,
              loadSnapshotMs: 10,
              readLatestReplyMs: 0,
              totalMs: 20,
            },
          },
        ],
      }),
      memory: makeMemory({ health: "stalled" }),
    });

    const plan = deriveOmegaExecutiveDispatchPlan({
      observer,
      previousAccounting: {
        totalCycles: 3,
        llmDispatches: 2,
        deferredCycles: 1,
        queueDispatchCounts: { goal: 2, maintenance: 0, anomaly: 0 },
        recentSelectedWorkItemIds: [
          "goal:goal-1",
          "goal:goal-1",
          "maintenance:self_repair:stalled_progress",
        ],
        recentDispatchedWorkItemIds: ["goal:goal-1", "goal:goal-1"],
        workItemLedger: [
          {
            itemId: "goal:goal-1",
            queueKind: "goal",
            state: "dispatched",
            selectedCount: 2,
            dispatchCount: 2,
            deferCount: 0,
            llmCalls: 2,
            observedWallTimeMs: 4000,
            cumulativeExpectedUtility: 1.1,
            cumulativeRealizedUtility: 0.3,
            averageBudgetPressure: 0.4,
            firstSeenAtCycle: 1,
            lastSelectedAtCycle: 3,
            lastDispatchedAtCycle: 3,
          },
        ],
      },
    });

    expect(plan.shouldDispatchLlmTurn).toBe(true);
    expect(plan.selectedAction).toBe("recover");
    expect(plan.queueKind).toBe("anomaly");
    expect(plan.selectedWorkItemId).toBe("anomaly:stalled_progress");
    expect(plan.dispatchedWorkItemId).toBe("anomaly:stalled_progress");
  });

  it("backs off repeated low-yield direct execution and prefers maintenance when available", () => {
    const observer = observeOmegaExecutiveState({
      snapshot: makeSnapshot({
        kernel: {
          revision: 2,
          sessionKey: "agent:test:main",
          turnCount: 4,
          identity: { continuityId: "c1", firstSeenAt: 1, lastSeenAt: 4 },
          world: { lastObservedChangedFiles: [] },
          goals: [
            {
              id: "goal-1",
              task: "repair app",
              targets: ["src/app.ts"],
              requiredKeys: [],
              status: "active",
              createdAt: 1,
              updatedAt: 4,
              createdTurn: 1,
              updatedTurn: 4,
              failureCount: 1,
              successCount: 0,
              observedChangedFiles: [],
            },
          ],
          tension: {
            openGoalCount: 1,
            staleGoalCount: 0,
            failureStreak: 0,
            repeatedFailureKinds: [],
            pendingCorrection: true,
          },
          causalGraph: { files: [], edges: [] },
          updatedAt: 4,
        },
      }),
      memory: makeMemory({ revalidationCandidates: 2, health: "needs_revalidation" }),
    });

    const plan = deriveOmegaExecutiveDispatchPlan({
      observer,
      previousAccounting: {
        totalCycles: 3,
        llmDispatches: 2,
        deferredCycles: 1,
        queueDispatchCounts: { goal: 2, maintenance: 0, anomaly: 0 },
        recentSelectedWorkItemIds: [
          "goal:goal-1",
          "goal:goal-1",
          "maintenance:self_repair:stalled_progress",
        ],
        recentDispatchedWorkItemIds: ["goal:goal-1", "goal:goal-1"],
        workItemLedger: [
          {
            itemId: "goal:goal-1",
            queueKind: "goal",
            state: "dispatched",
            selectedCount: 2,
            dispatchCount: 2,
            deferCount: 0,
            llmCalls: 2,
            observedWallTimeMs: 4000,
            cumulativeExpectedUtility: 1.1,
            cumulativeRealizedUtility: 0.3,
            averageBudgetPressure: 0.4,
            firstSeenAtCycle: 1,
            lastSelectedAtCycle: 3,
            lastDispatchedAtCycle: 3,
          },
        ],
      },
    });

    expect(plan.shouldDispatchLlmTurn).toBe(false);
    expect(plan.deferReason).toBe("repeat_low_yield");
    expect(plan.selectedAction).toBe("maintain");
    expect(plan.queueKind).toBe("maintenance");
    expect(plan.selectedWorkItemId).toBe("maintenance:memory:revalidate");
  });

  it("accumulates budget ledger details per dispatched work item", () => {
    const observer = observeOmegaExecutiveState({
      snapshot: makeSnapshot({
        operationalSignals: [
          {
            id: "turn-1",
            recordedAt: 1,
            iteration: 1,
            terminationReason: "continue",
            turnHealth: "progressing",
            progressObserved: true,
            timelineDelta: 1,
            kernelUpdated: true,
            latencyBreakdown: {
              sendAgentTurnMs: 10,
              loadSnapshotMs: 20,
              readLatestReplyMs: 5,
              totalMs: 60,
            },
          },
        ],
        kernel: {
          revision: 2,
          sessionKey: "agent:test:main",
          turnCount: 1,
          identity: { continuityId: "c1", firstSeenAt: 1, lastSeenAt: 1 },
          world: { lastObservedChangedFiles: [] },
          goals: [
            {
              id: "goal-2",
              task: "ship fix",
              targets: ["src/fix.ts"],
              requiredKeys: [],
              status: "active",
              createdAt: 1,
              updatedAt: 1,
              createdTurn: 1,
              updatedTurn: 1,
              failureCount: 1,
              successCount: 0,
              observedChangedFiles: [],
            },
          ],
          tension: {
            openGoalCount: 1,
            staleGoalCount: 0,
            failureStreak: 0,
            repeatedFailureKinds: [],
            pendingCorrection: true,
          },
          causalGraph: { files: [], edges: [] },
          updatedAt: 1,
        },
      }),
      memory: makeMemory(),
    });

    const plan = deriveOmegaExecutiveDispatchPlan({ observer });
    const accounting = deriveNextOmegaExecutiveDispatchAccounting({ plan });
    const ledger = accounting.workItemLedger.find(
      (entry) => entry.itemId === plan.dispatchedWorkItemId,
    );

    expect(plan.estimatedDispatchCostMs).toBe(60);
    expect(ledger?.observedWallTimeMs).toBe(60);
    expect(ledger?.llmCalls).toBe(1);
    expect(ledger?.averageBudgetPressure).toBeGreaterThanOrEqual(0);
    expect(ledger?.cumulativeRealizedUtility).toBeGreaterThanOrEqual(0);
  });
});
