import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  wakeAction: {
    kind: "heartbeat_ok",
    reason: "steady_state",
  } as {
    kind: string;
    reason: string;
    goalTask?: string;
  },
  authority: {
    decisionContext: {
      kernel: undefined,
      shouldDispatchHeartbeatPrompt: false,
      wsp: undefined,
      stateAuthority: undefined,
      controllerState: undefined,
      operationalSummary: {
        recentStalledTurns: 0,
        recentResolvedTurns: 0,
      },
      policy: {
        driveSignal: { kind: "idle" },
        driveSignalSource: "default",
        shouldRunAutonomy: false,
      },
      degradedComponents: [],
    },
    runtimeObserver: undefined,
    cognitiveKernel: undefined,
  } as Record<string, unknown>,
}));

vi.mock("./runtime-authority.js", () => ({
  loadOpenSkynetOmegaRuntimeAuthority: vi.fn(async () => hoisted.authority),
}));

vi.mock("./frontal/wake-policy.js", () => ({
  decideOmegaWakeAction: vi.fn(() => hoisted.wakeAction),
}));

vi.mock("./science-base-rag.js", () => ({
  queryScienceBase: vi.fn(async () => []),
}));

vi.mock("./operational-memory.js", () => ({
  loadOmegaOperationalMemoryTail: vi.fn(async () => []),
  summarizeOmegaOperationalMemory: vi.fn(() => ({
    recentStalledTurns: 0,
    recentResolvedTurns: 0,
  })),
}));

vi.mock("./session-context.js", () => ({
  loadOmegaSelfTimeKernel: vi.fn(async () => undefined),
  loadOmegaSessionTimeline: vi.fn(async () => []),
  pruneShadowedOmegaGoals: vi.fn(async () => ({ prunedGoalTasks: [] })),
  pruneStaleOmegaGoals: vi.fn(async () => ({ prunedGoalTasks: [] })),
  pruneSupersededOmegaGoals: vi.fn(async () => ({ prunedGoalTasks: [] })),
  focusActiveOmegaGoalTargets: vi.fn(async () => ({
    focusedGoalTask: undefined,
    focusedTargets: [],
  })),
}));

vi.mock("./execution-controller.js", () => ({
  deriveOmegaHeartbeatCorrectiveControl: vi.fn(() => ({ kind: "none" })),
}));

vi.mock("./recovery-runner.js", () => ({
  resumeInterruptedOmegaGoal: vi.fn(async () => ({ kind: "none" })),
}));

vi.mock("./problem-agenda.js", () => ({
  deriveOmegaAgendaExecutionContract: vi.fn(() => ({
    hypothesis: "Hypothesis",
    deliverable: "Deliverable",
    successCriteria: "Success",
    experimentMode: "normal",
  })),
}));

vi.mock("./engines/registry.js", () => ({
  getOmegaHeartbeatEngineRegistry: vi.fn(() => ({
    jepaEmpirical: { logSample: vi.fn() },
    collectKernelSignals: vi.fn(() => ({ signals: [], thoughts: [], contradictions: [] })),
    testUntestedHypotheses: vi.fn(async () => ({ signals: [] })),
    continuousThinking: { getStats: vi.fn(() => ({})) },
  })),
}));

vi.mock("./engines/score-engine-signal.js", () => ({
  scoreOmegaEngineSignals: vi.fn(() => ({ confidence: 0 })),
  mergeOmegaDriveSignalWithEngineScore: vi.fn(({ baseDriveSignal }) => baseDriveSignal),
}));

vi.mock("./jepa-drive-enhancement.js", () => ({
  parseJepaTensionFromKernelTimeline: vi.fn(() => undefined),
  enhanceDriveWithJepaTension: vi.fn((signal) => signal),
}));

vi.mock("./inner-life/index.js", () => ({
  buildAutonomousDirectivePrompt: vi.fn(() => undefined),
}));

vi.mock("./autonomous-executor.js", () => ({
  runAutonomousCycle: vi.fn(async () => null),
}));

import { buildOmegaHeartbeatPrompt } from "./heartbeat-core.js";

describe("heartbeat-core", () => {
  beforeEach(() => {
    hoisted.wakeAction = { kind: "heartbeat_ok", reason: "steady_state" };
    hoisted.authority = {
      decisionContext: {
        kernel: undefined,
        shouldDispatchHeartbeatPrompt: false,
        wsp: undefined,
        stateAuthority: undefined,
        controllerState: undefined,
        operationalSummary: {
          recentStalledTurns: 0,
          recentResolvedTurns: 0,
        },
        policy: {
          driveSignal: { kind: "idle" },
          driveSignalSource: "default",
          shouldRunAutonomy: false,
        },
        degradedComponents: [],
      },
      runtimeObserver: undefined,
      cognitiveKernel: undefined,
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("builds a conservative degraded prompt when the system is degraded but otherwise idle", async () => {
    hoisted.authority = {
      decisionContext: {
        ...(hoisted.authority as { decisionContext: object }).decisionContext,
        stateAuthority: {
          operationalHealth: {
            status: "fallback",
            reason: "recent_turn_health_stale",
          },
        },
        degradedComponents: [
          { component: "omega_wsp", reason: "load_failed" },
          { component: "controller_state", reason: "load_failed" },
        ],
      },
      runtimeObserver: undefined,
      cognitiveKernel: undefined,
    };

    const prompt = await buildOmegaHeartbeatPrompt({
      workspaceRoot: "/tmp/openskynet-heartbeat-core",
      sessionKey: "main",
    });

    expect(prompt).toContain("[OMEGA Degraded]");
    expect(prompt).toContain("omega_wsp, controller_state");
    expect(prompt).toContain("Operational memory is stale");
    expect(prompt).toContain("HEARTBEAT_OK");
  });

  it("includes runtime and cognitive kernel priors in the wake prompt when dispatching work", async () => {
    hoisted.wakeAction = {
      kind: "review_active_goal",
      reason: "needs_follow_up",
      goalTask: "repair continuity",
    };
    hoisted.authority = {
      decisionContext: {
        ...(hoisted.authority as { decisionContext: object }).decisionContext,
        shouldDispatchHeartbeatPrompt: true,
        controllerState: {
          dispatchPlan: {
            shouldDispatchLlmTurn: true,
            selectedAction: "maintain",
          },
          selectedWorkItem: {
            id: "maintenance:agenda:continuity",
            detail: "Repair continuity drift",
            queueKind: "maintenance",
          },
        },
      },
      runtimeObserver: {
        freshness: "fresh",
        accuracy: 0.84,
        majorityBaseline: 0.54,
        improvementOverBaseline: 0.3,
        trajectorySamples: 96,
        harvestedEpisodes: 100,
        lookback: 3,
        dominantLabel: "progress",
      },
      cognitiveKernel: {
        freshness: "fresh",
        active: true,
        activationReason: "enabled_by_default",
        accuracy: 0.86,
        majorityBaseline: 0.55,
        improvementOverBaseline: 0.31,
        trajectorySamples: 98,
        harvestedEpisodes: 105,
        evaluatedSamples: 70,
        warmupSamples: 16,
        dominantLabel: "progress",
        targetAccuracy: 0.9,
        deactivationThreshold: 0.8,
      },
    };

    const prompt = await buildOmegaHeartbeatPrompt({
      workspaceRoot: "/tmp/openskynet-heartbeat-core",
      sessionKey: "main",
    });

    expect(prompt).toContain("[OMEGA Wake]");
    expect(prompt).toContain("Runtime observer signal");
    expect(prompt).toContain("Cognitive kernel signal");
    expect(prompt).toContain("enabled by default while accuracy stays >= 0.80");
    expect(prompt).toContain("Executive action: maintain");
    expect(prompt).toContain("Executive work item: Repair continuity drift");
  });
});
