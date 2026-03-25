import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../agents/subagent-spawn.js", () => ({
  spawnSubagentDirect: vi.fn(async () => ({
    status: "accepted",
    childSessionKey: "child-session",
    runId: "run-isolated",
  })),
}));

vi.mock("./session-task.js", () => ({
  runValidatedOmegaSessionTask: vi.fn(async () => ({
    ok: true,
    runId: "run-delegate",
    reply: '{"status":"ok"}',
  })),
  awaitValidatedOmegaSessionRun: vi.fn(async () => ({
    ok: true,
    runId: "run-isolated",
    reply: '{"status":"ok"}',
  })),
}));

vi.mock("./session-context.js", () => ({
  loadOmegaSelfTimeKernel: vi.fn(),
  recordOmegaSessionOutcome: vi.fn(async () => undefined),
}));

vi.mock("./empirical-metrics.js", () => ({
  loadOmegaEmpiricalMetrics: vi.fn(async () => ({
    version: 3,
    updatedAt: 0,
    validation: {
      recordedOutcomes: 0,
      validatedOutcomes: 0,
      preventedFalseSuccesses: 0,
      falseSuccessRate: 0,
    },
    routing: {
      toolTasks: 0,
      llmCallsEstimated: 0,
      llmCallsSaved: 0,
      meanLlmCallsPerToolTask: 0,
      routeCounts: {},
    },
    background: { usefulActions: 0 },
    heartbeat: {
      cyclesStarted: 0,
      cyclesCompleted: 0,
      executiveActions: 0,
      usefulExecutiveActions: 0,
      structuredTerminations: 0,
      textTokenTerminations: 0,
      iterations: 0,
    },
    recovery: { strategies: {} },
  })),
  recordOmegaRouteMetrics: vi.fn(async () => undefined),
  recordOmegaRecoveryStrategyMetrics: vi.fn(async () => undefined),
  buildOmegaRecoveryStrategyKey: vi.fn(() => "mock-key"),
}));

vi.mock("./interaction-model.js", () => ({
  buildOmegaInteractionPrompt: vi.fn(async () => "[OMEGA interaction]"),
}));

import { spawnSubagentDirect } from "../agents/subagent-spawn.js";
import { loadOmegaEmpiricalMetrics } from "./empirical-metrics.js";
import { recordOmegaOperationalTurnMemory } from "./operational-memory.js";
import { resumeInterruptedOmegaGoal } from "./recovery-runner.js";
import { loadOmegaSelfTimeKernel } from "./session-context.js";
import { runValidatedOmegaSessionTask } from "./session-task.js";

const tmpDirs: string[] = [];

describe("omega recovery runner", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await Promise.all(
      tmpDirs.splice(0, tmpDirs.length).map((dir) => fs.rm(dir, { recursive: true, force: true })),
    );
  });

  it("escalates to isolated recovery after recent stalled operational turns", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "omega-recovery-runner-"));
    tmpDirs.push(workspaceRoot);

    vi.mocked(loadOmegaSelfTimeKernel).mockResolvedValue({
      revision: 2,
      sessionKey: "main",
      turnCount: 4,
      activeGoalId: "goal-1",
      identity: {
        continuityId: "cid",
        firstSeenAt: 1,
        lastSeenAt: 4,
        lastTask: "fix json",
        lastInteractionKind: "direct_instruction",
      },
      world: {
        lastOutcomeStatus: "error",
        lastErrorKind: "invalid_structured_result",
        lastObservedChangedFiles: [],
      },
      goals: [
        {
          id: "goal-1",
          task: "fix json",
          targets: [],
          requiredKeys: ["status"],
          status: "active",
          createdAt: 1,
          updatedAt: 4,
          createdTurn: 1,
          updatedTurn: 4,
          failureCount: 1,
          successCount: 0,
          observedChangedFiles: [],
          lastErrorKind: "invalid_structured_result",
        },
      ],
      tension: {
        openGoalCount: 1,
        staleGoalCount: 0,
        failureStreak: 1,
        repeatedFailureKinds: ["invalid_structured_result"],
        pendingCorrection: true,
      },
      causalGraph: {
        files: [],
        edges: [],
      },
      updatedAt: 4,
    } as never);

    await recordOmegaOperationalTurnMemory({
      workspaceRoot,
      sessionKey: "main",
      turn: {
        iteration: 3,
        terminationReason: "continue",
        decision: {
          shouldContinue: true,
          stopReason: "continue",
          replyHeartbeatOk: false,
          structuredIdleDetected: false,
        },
        stateDelta: {
          timelineDelta: 0,
          kernelUpdated: false,
          progressObserved: false,
        },
        latencyBreakdown: {
          sendAgentTurnMs: 10,
          loadSnapshotMs: 20,
          readLatestReplyMs: 5,
          totalMs: 35,
        },
      },
      turnPolicy: {
        turnHealth: "stalled",
        shouldBackoff: true,
      },
    });

    const result = await resumeInterruptedOmegaGoal({
      workspaceRoot,
      sessionKey: "main",
    });

    expect(result).toMatchObject({
      kind: "resumed_interrupted_goal",
      route: "sessions_spawn",
    });
    expect(spawnSubagentDirect).toHaveBeenCalledTimes(1);
    expect(runValidatedOmegaSessionTask).not.toHaveBeenCalled();
  });

  it("uses local recovery first for a narrow single-target write failure without recent stalls", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "omega-recovery-single-target-"));
    tmpDirs.push(workspaceRoot);

    vi.mocked(loadOmegaSelfTimeKernel).mockResolvedValue({
      revision: 2,
      sessionKey: "main",
      turnCount: 4,
      activeGoalId: "goal-1",
      identity: {
        continuityId: "cid",
        firstSeenAt: 1,
        lastSeenAt: 4,
        lastTask: "patch module",
        lastInteractionKind: "direct_instruction",
      },
      world: {
        lastOutcomeStatus: "error",
        lastErrorKind: "target_not_touched",
        lastObservedChangedFiles: [],
      },
      goals: [
        {
          id: "goal-1",
          task: "patch module",
          targets: ["workspace/a.py"],
          requiredKeys: [],
          status: "active",
          createdAt: 1,
          updatedAt: 4,
          createdTurn: 1,
          updatedTurn: 4,
          failureCount: 1,
          successCount: 0,
          observedChangedFiles: [],
          lastErrorKind: "target_not_touched",
        },
      ],
      tension: {
        openGoalCount: 1,
        staleGoalCount: 0,
        failureStreak: 1,
        repeatedFailureKinds: ["target_not_touched"],
        pendingCorrection: true,
      },
      causalGraph: {
        files: [],
        edges: [],
      },
      updatedAt: 4,
    } as never);

    const result = await resumeInterruptedOmegaGoal({
      workspaceRoot,
      sessionKey: "main",
    });

    expect(result).toMatchObject({
      kind: "resumed_interrupted_goal",
      route: "omega_delegate",
      recovery: {
        remainingTargets: ["workspace/a.py"],
      },
    });
    expect(runValidatedOmegaSessionTask).toHaveBeenCalledTimes(1);
    expect(runValidatedOmegaSessionTask).toHaveBeenCalledWith(
      expect.objectContaining({
        sendParams: expect.objectContaining({
          message: expect.stringContaining(
            "Route choice: local retry because the repair is narrow, single-target, and low-risk.",
          ),
        }),
      }),
    );
    expect(spawnSubagentDirect).not.toHaveBeenCalled();
  });

  it("biases toward the empirically better recovery route for the same failure shape", async () => {
    const workspaceRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "omega-recovery-empirical-bias-"),
    );
    tmpDirs.push(workspaceRoot);

    vi.mocked(loadOmegaSelfTimeKernel).mockResolvedValue({
      revision: 2,
      sessionKey: "main",
      turnCount: 4,
      activeGoalId: "goal-1",
      identity: {
        continuityId: "cid",
        firstSeenAt: 1,
        lastSeenAt: 4,
        lastTask: "patch module",
        lastInteractionKind: "direct_instruction",
      },
      world: {
        lastOutcomeStatus: "error",
        lastErrorKind: "target_not_touched",
        lastObservedChangedFiles: [],
      },
      goals: [
        {
          id: "goal-1",
          task: "patch module",
          targets: ["workspace/a.py"],
          requiredKeys: [],
          status: "active",
          createdAt: 1,
          updatedAt: 4,
          createdTurn: 1,
          updatedTurn: 4,
          failureCount: 1,
          successCount: 0,
          observedChangedFiles: [],
          lastErrorKind: "target_not_touched",
        },
      ],
      tension: {
        openGoalCount: 1,
        staleGoalCount: 0,
        failureStreak: 1,
        repeatedFailureKinds: ["target_not_touched"],
        pendingCorrection: true,
      },
      causalGraph: { files: [], edges: [] },
      updatedAt: 4,
    } as never);
    vi.mocked(loadOmegaEmpiricalMetrics).mockResolvedValue({
      version: 3,
      updatedAt: 0,
      validation: {
        recordedOutcomes: 0,
        validatedOutcomes: 0,
        preventedFalseSuccesses: 0,
        falseSuccessRate: 0,
      },
      routing: {
        toolTasks: 0,
        llmCallsEstimated: 0,
        llmCallsSaved: 0,
        meanLlmCallsPerToolTask: 0,
        routeCounts: {},
      },
      background: { usefulActions: 0 },
      heartbeat: {
        cyclesStarted: 0,
        cyclesCompleted: 0,
        executiveActions: 0,
        usefulExecutiveActions: 0,
        structuredTerminations: 0,
        textTokenTerminations: 0,
        iterations: 0,
      },
      recovery: {
        strategies: {
          "target_not_touched|single_target|contained|omega_delegate": {
            successes: 3,
            failures: 0,
          },
          "target_not_touched|single_target|contained|sessions_spawn": {
            successes: 0,
            failures: 2,
          },
        },
      },
    });

    const result = await resumeInterruptedOmegaGoal({
      workspaceRoot,
      sessionKey: "main",
    });

    expect(result).toMatchObject({
      kind: "resumed_interrupted_goal",
      route: "omega_delegate",
    });
    expect(runValidatedOmegaSessionTask).toHaveBeenCalledWith(
      expect.objectContaining({
        sendParams: expect.objectContaining({
          message: expect.stringContaining(
            "Route choice: local recovery is empirically outperforming isolation for this failure shape.",
          ),
        }),
      }),
    );
  });

  it("uses local recovery first for collateral locality failures", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "omega-recovery-locality-"));
    tmpDirs.push(workspaceRoot);

    vi.mocked(loadOmegaSelfTimeKernel).mockResolvedValue({
      revision: 2,
      sessionKey: "main",
      turnCount: 4,
      activeGoalId: "goal-1",
      identity: {
        continuityId: "cid",
        firstSeenAt: 1,
        lastSeenAt: 4,
        lastTask: "patch module",
        lastInteractionKind: "direct_instruction",
      },
      world: {
        lastOutcomeStatus: "error",
        lastErrorKind: "unexpected_collateral_writes",
        lastObservedChangedFiles: ["workspace/a.py", "workspace/b.py"],
      },
      goals: [
        {
          id: "goal-1",
          task: "patch module",
          targets: ["workspace/a.py"],
          requiredKeys: [],
          status: "active",
          createdAt: 1,
          updatedAt: 4,
          createdTurn: 1,
          updatedTurn: 4,
          failureCount: 1,
          successCount: 0,
          observedChangedFiles: ["workspace/a.py", "workspace/b.py"],
          lastErrorKind: "unexpected_collateral_writes",
        },
      ],
      tension: {
        openGoalCount: 1,
        staleGoalCount: 0,
        failureStreak: 1,
        repeatedFailureKinds: ["unexpected_collateral_writes"],
        pendingCorrection: true,
      },
      causalGraph: {
        files: [],
        edges: [],
      },
      updatedAt: 4,
    } as never);

    const result = await resumeInterruptedOmegaGoal({
      workspaceRoot,
      sessionKey: "main",
    });

    expect(result).toMatchObject({
      kind: "resumed_interrupted_goal",
      route: "omega_delegate",
      recovery: {
        reason: "verified_locality_failure_after_restart",
        collateralPaths: ["workspace/b.py"],
      },
    });
    expect(runValidatedOmegaSessionTask).toHaveBeenCalledTimes(1);
    expect(runValidatedOmegaSessionTask).toHaveBeenCalledWith(
      expect.objectContaining({
        validation: expect.objectContaining({
          expectedPaths: ["workspace/a.py"],
          watchedPaths: ["workspace/a.py", "workspace/b.py"],
        }),
      }),
    );
    expect(spawnSubagentDirect).not.toHaveBeenCalled();
  });

  it("escalates collateral locality failures to isolated recovery on recurrence", async () => {
    const workspaceRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "omega-recovery-locality-escalate-"),
    );
    tmpDirs.push(workspaceRoot);

    vi.mocked(loadOmegaSelfTimeKernel).mockResolvedValue({
      revision: 3,
      sessionKey: "main",
      turnCount: 5,
      activeGoalId: "goal-1",
      identity: {
        continuityId: "cid",
        firstSeenAt: 1,
        lastSeenAt: 5,
        lastTask: "patch module",
        lastInteractionKind: "direct_instruction",
      },
      world: {
        lastOutcomeStatus: "error",
        lastErrorKind: "unexpected_collateral_writes",
        lastObservedChangedFiles: ["workspace/a.py", "workspace/b.py"],
      },
      goals: [
        {
          id: "goal-1",
          task: "patch module",
          targets: ["workspace/a.py"],
          requiredKeys: [],
          status: "active",
          createdAt: 1,
          updatedAt: 5,
          createdTurn: 1,
          updatedTurn: 5,
          failureCount: 2,
          successCount: 0,
          observedChangedFiles: ["workspace/a.py", "workspace/b.py"],
          lastErrorKind: "unexpected_collateral_writes",
        },
      ],
      tension: {
        openGoalCount: 1,
        staleGoalCount: 0,
        failureStreak: 2,
        repeatedFailureKinds: ["unexpected_collateral_writes"],
        pendingCorrection: true,
      },
      causalGraph: {
        files: [],
        edges: [],
      },
      updatedAt: 5,
    } as never);

    const result = await resumeInterruptedOmegaGoal({
      workspaceRoot,
      sessionKey: "main",
    });

    expect(result).toMatchObject({
      kind: "resumed_interrupted_goal",
      route: "sessions_spawn",
      recovery: {
        reason: "verified_locality_failure_after_restart",
        collateralPaths: ["workspace/b.py"],
      },
    });
    expect(spawnSubagentDirect).toHaveBeenCalledTimes(1);
    expect(spawnSubagentDirect).toHaveBeenCalledWith(
      expect.objectContaining({
        task: expect.stringContaining(
          "Collateral paths to preserve or repair locally: workspace/b.py",
        ),
      }),
      expect.anything(),
    );
  });
});
