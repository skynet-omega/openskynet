import { observeOmegaExecutiveState } from "../../src/omega/executive-arbitration.js";
import type { OmegaMemoryOrchestratorSummary } from "../../src/omega/memory-orchestrator.js";
import type { OmegaWorldModelSnapshot } from "../../src/omega/world-model.js";

type Scenario = {
  name: string;
  snapshot: OmegaWorldModelSnapshot;
  memory: OmegaMemoryOrchestratorSummary;
  expectedAction: "recover" | "direct_execute" | "maintain" | "idle";
};

export type OmegaExecutiveBenchmarkSummary = {
  moduleHits: number;
  baselineHits: number;
  total: number;
  netImprovement: number;
  targetedImprovementValidated: boolean;
};

function makeSnapshot(overrides: Partial<OmegaWorldModelSnapshot> = {}): OmegaWorldModelSnapshot {
  return {
    sessionKey: "agent:test:main",
    timelineLength: 0,
    relevantMemories: [],
    operationalSignals: [],
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

function buildScenarios(): Scenario[] {
  return [
    {
      name: "repeat-failure-needs-recovery",
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
      expectedAction: "recover",
    },
    {
      name: "active-goal-direct-execute",
      snapshot: makeSnapshot({
        kernel: {
          revision: 2,
          sessionKey: "agent:test:main",
          turnCount: 2,
          identity: { continuityId: "c1", firstSeenAt: 1, lastSeenAt: 2 },
          world: { lastObservedChangedFiles: [] },
          goals: [
            {
              id: "goal-2",
              task: "implement feature",
              targets: ["src/feature.ts"],
              requiredKeys: [],
              status: "active",
              createdAt: 1,
              updatedAt: 2,
              createdTurn: 1,
              updatedTurn: 2,
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
            pendingCorrection: false,
          },
          causalGraph: { files: [], edges: [] },
          updatedAt: 2,
        },
      }),
      memory: makeMemory(),
      expectedAction: "direct_execute",
    },
    {
      name: "memory-maintenance-when-no-goal",
      snapshot: makeSnapshot(),
      memory: makeMemory({ revalidationCandidates: 2 }),
      expectedAction: "maintain",
    },
    {
      name: "idle-under-heavy-budget-pressure",
      snapshot: makeSnapshot({
        kernel: {
          revision: 2,
          sessionKey: "agent:test:main",
          turnCount: 2,
          identity: { continuityId: "c1", firstSeenAt: 1, lastSeenAt: 2 },
          world: { lastObservedChangedFiles: [] },
          goals: [
            {
              id: "goal-3",
              task: "refine docs",
              targets: [],
              requiredKeys: [],
              status: "active",
              createdAt: 1,
              updatedAt: 2,
              createdTurn: 1,
              updatedTurn: 2,
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
            pendingCorrection: false,
          },
          causalGraph: { files: [], edges: [] },
          updatedAt: 2,
        },
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
      }),
      memory: makeMemory(),
      expectedAction: "idle",
    },
  ];
}

function baselineAction(scenario: Scenario): Scenario["expectedAction"] {
  const hasGoal = Boolean(
    scenario.snapshot.kernel?.goals?.some((goal) => goal.status === "active"),
  );
  return hasGoal ? "direct_execute" : "idle";
}

export function computeOmegaExecutiveBenchmarkSummary(): OmegaExecutiveBenchmarkSummary {
  const scenarios = buildScenarios();
  let moduleHits = 0;
  let baselineHits = 0;
  for (const scenario of scenarios) {
    const moduleAction = observeOmegaExecutiveState({
      snapshot: scenario.snapshot,
      memory: scenario.memory,
    }).decision.selectedAction;
    if (moduleAction === scenario.expectedAction) {
      moduleHits += 1;
    }
    if (baselineAction(scenario) === scenario.expectedAction) {
      baselineHits += 1;
    }
  }
  return {
    moduleHits,
    baselineHits,
    total: scenarios.length,
    netImprovement: moduleHits - baselineHits,
    targetedImprovementValidated: moduleHits > baselineHits,
  };
}
