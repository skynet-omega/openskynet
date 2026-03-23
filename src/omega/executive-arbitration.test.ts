import { describe, expect, it } from "vitest";
import { observeOmegaExecutiveState } from "./executive-arbitration.js";
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

describe("observeOmegaExecutiveState", () => {
  it("prioritizes recovery when failure streak is high", () => {
    const result = observeOmegaExecutiveState({
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

    expect(result.mode).toBe("recovering");
    expect(result.decision.selectedAction).toBe("recover");
    expect(result.decision.selectedGoalId).toBe("goal-1");
  });

  it("promotes a proactive failure probe when repeated failures hit a causal limit", () => {
    const result = observeOmegaExecutiveState({
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
        problemAgenda: [
          {
            id: "agenda-failure",
            classKey: "failure:target_not_touched",
            label: "Explore a reusable strategy for target_not_touched",
            source: "failure_pattern",
            status: "open",
            priority: 0.8,
            evidenceCount: 2,
            activationCount: 0,
            successCount: 0,
            failureCount: 0,
            realizedUtility: 0,
            firstSeenAt: 1,
            lastSeenAt: 2,
          },
        ],
      }),
      memory: makeMemory(),
    });

    expect(result.mode).toBe("active");
    expect(result.decision.selectedAction).toBe("maintain");
    expect(result.decision.selectedGoalId).toBe("agenda:failure:target_not_touched");
    expect(result.decision.rationale.join(" ")).toContain("probe experiment");
  });

  it("switches into self-repair maintenance when recent turns are stalled", () => {
    const result = observeOmegaExecutiveState({
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

    expect(result.mode).toBe("active");
    expect(result.decision.selectedAction).toBe("maintain");
    expect(result.decision.selectedGoalId).toBe("self_repair:stalled_progress");
    expect(result.maintenanceQueue[0]?.kind).toBe("self_repair");
    expect(result.decision.rationale.join(" ")).toContain("stalled");
  });

  it("penalizes direct execution value after a learned reframe-before-retry constraint", () => {
    const baseline = observeOmegaExecutiveState({
      snapshot: makeSnapshot({
        kernel: {
          revision: 2,
          sessionKey: "agent:test:main",
          turnCount: 3,
          identity: { continuityId: "c1", firstSeenAt: 1, lastSeenAt: 3 },
          world: { lastObservedChangedFiles: [] },
          goals: [
            {
              id: "goal-1",
              task: "repair app",
              targets: ["src/a.ts", "src/b.ts"],
              requiredKeys: [],
              status: "active",
              createdAt: 1,
              updatedAt: 3,
              createdTurn: 1,
              updatedTurn: 3,
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
          updatedAt: 3,
        },
        selfState: {
          activeGoal: "repair app",
          activeTargets: ["src/a.ts", "src/b.ts"],
          requiredKeys: [],
          learnedConstraints: [],
          updatedAt: 3,
        },
      }),
      memory: makeMemory(),
    });

    const reframed = observeOmegaExecutiveState({
      snapshot: makeSnapshot({
        kernel: {
          revision: 2,
          sessionKey: "agent:test:main",
          turnCount: 3,
          identity: { continuityId: "c1", firstSeenAt: 1, lastSeenAt: 3 },
          world: { lastObservedChangedFiles: [] },
          goals: [
            {
              id: "goal-1",
              task: "repair app",
              targets: ["src/a.ts", "src/b.ts"],
              requiredKeys: [],
              status: "active",
              createdAt: 1,
              updatedAt: 3,
              createdTurn: 1,
              updatedTurn: 3,
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
          updatedAt: 3,
        },
        selfState: {
          activeGoal: "repair app",
          activeTargets: ["src/b.ts"],
          requiredKeys: [],
          learnedConstraints: ["reframe_before_retry", "narrow_to_unresolved_targets"],
          updatedAt: 3,
        },
      }),
      memory: makeMemory(),
    });

    expect(reframed.queue[0]?.expectedUtility).toBeLessThan(
      baseline.queue[0]?.expectedUtility ?? 1,
    );
    expect(reframed.queue[0]?.failureRisk).toBeGreaterThan(baseline.queue[0]?.failureRisk ?? 0);
    expect(reframed.queue[0]?.estimatedCost).toBeLessThan(baseline.queue[0]?.estimatedCost ?? 1);
  });

  it("devalues direct execution when empirical recovery preference favors isolation", () => {
    const baseline = observeOmegaExecutiveState({
      snapshot: makeSnapshot({
        kernel: {
          revision: 2,
          sessionKey: "agent:test:main",
          turnCount: 3,
          identity: { continuityId: "c1", firstSeenAt: 1, lastSeenAt: 3 },
          world: { lastObservedChangedFiles: [] },
          goals: [
            {
              id: "goal-1",
              task: "repair app",
              targets: ["src/a.ts"],
              requiredKeys: [],
              status: "active",
              createdAt: 1,
              updatedAt: 3,
              createdTurn: 1,
              updatedTurn: 3,
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
          updatedAt: 3,
        },
        selfState: {
          activeGoal: "repair app",
          activeTargets: ["src/a.ts"],
          requiredKeys: [],
          learnedConstraints: [],
          updatedAt: 3,
        },
      }),
      memory: makeMemory(),
    });

    const isolationBiased = observeOmegaExecutiveState({
      snapshot: makeSnapshot({
        kernel: {
          revision: 2,
          sessionKey: "agent:test:main",
          turnCount: 3,
          identity: { continuityId: "c1", firstSeenAt: 1, lastSeenAt: 3 },
          world: { lastObservedChangedFiles: [] },
          goals: [
            {
              id: "goal-1",
              task: "repair app",
              targets: ["src/a.ts"],
              requiredKeys: [],
              status: "active",
              createdAt: 1,
              updatedAt: 3,
              createdTurn: 1,
              updatedTurn: 3,
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
          updatedAt: 3,
        },
        selfState: {
          activeGoal: "repair app",
          activeTargets: ["src/a.ts"],
          requiredKeys: [],
          learnedConstraints: [],
          updatedAt: 3,
        },
        activeRecoveryPreference: {
          preferredRoute: "sessions_spawn",
          confidence: 0.8,
          delegateSuccesses: 1,
          isolatedSuccesses: 4,
        },
      }),
      memory: makeMemory(),
    });

    expect(isolationBiased.queue[0]?.expectedUtility).toBeLessThan(
      baseline.queue[0]?.expectedUtility ?? 1,
    );
    expect(isolationBiased.queue[0]?.failureRisk).toBeGreaterThan(
      baseline.queue[0]?.failureRisk ?? 0,
    );
  });

  it("falls back to generalized recovery preference when active preference is absent", () => {
    const baseline = observeOmegaExecutiveState({
      snapshot: makeSnapshot({
        kernel: {
          revision: 2,
          sessionKey: "agent:test:main",
          turnCount: 3,
          identity: { continuityId: "c1", firstSeenAt: 1, lastSeenAt: 3 },
          world: { lastObservedChangedFiles: [] },
          goals: [
            {
              id: "goal-1",
              task: "repair app",
              targets: ["src/a.ts"],
              requiredKeys: [],
              status: "active",
              createdAt: 1,
              updatedAt: 3,
              createdTurn: 1,
              updatedTurn: 3,
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
          updatedAt: 3,
        },
        selfState: {
          activeGoal: "repair app",
          activeTargets: ["src/a.ts"],
          requiredKeys: [],
          learnedConstraints: [],
          updatedAt: 3,
        },
      }),
      memory: makeMemory(),
    });

    const generalized = observeOmegaExecutiveState({
      snapshot: makeSnapshot({
        kernel: {
          revision: 2,
          sessionKey: "agent:test:main",
          turnCount: 3,
          identity: { continuityId: "c1", firstSeenAt: 1, lastSeenAt: 3 },
          world: { lastObservedChangedFiles: [] },
          goals: [
            {
              id: "goal-1",
              task: "repair app",
              targets: ["src/a.ts"],
              requiredKeys: [],
              status: "active",
              createdAt: 1,
              updatedAt: 3,
              createdTurn: 1,
              updatedTurn: 3,
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
          updatedAt: 3,
        },
        selfState: {
          activeGoal: "repair app",
          activeTargets: ["src/a.ts"],
          requiredKeys: [],
          learnedConstraints: [],
          updatedAt: 3,
        },
        generalizedRecoveryPreference: {
          preferredRoute: "sessions_spawn",
          confidence: 0.75,
          delegateSuccesses: 1,
          isolatedSuccesses: 3,
          mechanismKey: "target_not_touched|single_target",
        },
      }),
      memory: makeMemory(),
    });

    expect(generalized.queue[0]?.expectedUtility).toBeLessThan(
      baseline.queue[0]?.expectedUtility ?? 1,
    );
    expect(generalized.queue[0]?.failureRisk).toBeGreaterThan(baseline.queue[0]?.failureRisk ?? 0);
  });

  it("prefers the higher-yield agenda line when reopening proactive work", () => {
    const result = observeOmegaExecutiveState({
      snapshot: makeSnapshot({
        problemAgenda: [
          {
            id: "agenda-low",
            classKey: "initiative:stalled_progress",
            label: "Investigate stalled progress patterns and open a better line of attack",
            source: "stalled_progress",
            status: "open",
            priority: 0.6,
            evidenceCount: 2,
            activationCount: 2,
            successCount: 0,
            failureCount: 2,
            realizedUtility: -0.45,
            firstSeenAt: 1,
            lastSeenAt: 3,
          },
          {
            id: "agenda-high",
            classKey: "initiative:autonomy_improvement",
            label: "Open a small autonomy-improvement experiment with measurable value",
            source: "initiative",
            status: "open",
            priority: 0.38,
            evidenceCount: 1,
            activationCount: 1,
            successCount: 2,
            failureCount: 0,
            realizedUtility: 0.42,
            firstSeenAt: 1,
            lastSeenAt: 4,
          },
        ],
        kernel: {
          revision: 2,
          sessionKey: "agent:test:main",
          turnCount: 3,
          identity: { continuityId: "c1", firstSeenAt: 1, lastSeenAt: 3 },
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
          updatedAt: 3,
        },
      }),
      memory: makeMemory(),
    });

    expect(result.decision.selectedAction).toBe("maintain");
    expect(result.decision.selectedGoalId).toBe("agenda:initiative:autonomy_improvement");
  });

  it("reopens a proactive agenda line when no active goals are pending", () => {
    const result = observeOmegaExecutiveState({
      snapshot: makeSnapshot({
        problemAgenda: [
          {
            id: "agenda-1",
            classKey: "initiative:autonomy_improvement",
            label: "Open a small autonomy-improvement experiment with measurable value",
            source: "initiative",
            status: "open",
            priority: 0.42,
            evidenceCount: 1,
            activationCount: 0,
            successCount: 0,
            failureCount: 0,
            realizedUtility: 0,
            firstSeenAt: 1,
            lastSeenAt: 1,
          },
        ],
        kernel: {
          revision: 2,
          sessionKey: "agent:test:main",
          turnCount: 3,
          identity: { continuityId: "c1", firstSeenAt: 1, lastSeenAt: 3 },
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
          updatedAt: 3,
        },
      }),
      memory: makeMemory(),
    });

    expect(result.mode).toBe("active");
    expect(result.decision.selectedAction).toBe("maintain");
    expect(result.decision.selectedGoalId).toBe("agenda:initiative:autonomy_improvement");
    expect(result.decision.rationale.join(" ")).toContain("proactive");
  });

  it("stays idle when no goals or anomalies justify work", () => {
    const result = observeOmegaExecutiveState({
      snapshot: makeSnapshot(),
      memory: makeMemory(),
    });

    expect(result.mode).toBe("idle");
    expect(result.decision.selectedAction).toBe("idle");
  });
});
