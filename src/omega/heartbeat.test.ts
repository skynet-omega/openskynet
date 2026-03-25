import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadOmegaEmpiricalMetrics } from "./empirical-metrics.js";
import * as executionController from "./execution-controller.js";
import {
  applyOmegaHeartbeatExecutiveAction,
  buildOmegaHeartbeatPrompt,
  deriveOmegaHeartbeatContinuationDelay,
  deriveOmegaHeartbeatTurnDecision,
  executeOmegaHeartbeatTurnWithDeps,
  runOneHeartbeatCycleWithDeps,
  type OmegaHeartbeatCycleDeps,
  type OmegaHeartbeatRuntimeSnapshot,
} from "./heartbeat.js";
import { recordOmegaOperationalTurnMemory } from "./operational-memory.js";
import type { OmegaSelfTimeKernelState } from "./self-time-kernel.js";
import { recordOmegaSessionOutcome } from "./session-context.js";

const tmpDirs: string[] = [];

async function createWorkspaceRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "openskynet-omega-heartbeat-"));
  tmpDirs.push(root);
  return root;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    tmpDirs.splice(0, tmpDirs.length).map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
});

function createDeps(overrides: Partial<OmegaHeartbeatCycleDeps> = {}): OmegaHeartbeatCycleDeps {
  return {
    buildPrompt: vi.fn(async () => "heartbeat prompt"),
    loadRuntimeSnapshot: vi.fn(async () => ({ timeline: [], kernel: undefined })),
    sendAgentTurn: vi.fn(async () => undefined),
    appendConsciousnessLog: vi.fn(async () => undefined),
    applyExecutiveAction: vi.fn(async () => ({
      kind: "none" as const,
      wakeAction: { kind: "heartbeat_ok" as const, reason: "none" },
    })),
    readLatestReply: vi.fn(async () => undefined),
    recordMetric: vi.fn(async () => undefined),
    ensureDirectories: vi.fn(async () => undefined),
    sleep: vi.fn(async () => undefined),
    ...overrides,
  };
}

function makeKernel(overrides: Partial<OmegaSelfTimeKernelState> = {}): OmegaSelfTimeKernelState {
  return {
    revision: 2,
    sessionKey: "main",
    turnCount: 1,
    activeGoalId: undefined,
    identity: { continuityId: "cid", firstSeenAt: 1, lastSeenAt: 1 },
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
    updatedAt: 10,
    ...overrides,
  };
}

describe("omega heartbeat", () => {
  it("stops immediately on a structured executive recovery success", async () => {
    const workspaceRoot = await createWorkspaceRoot();
    const deps = createDeps({
      applyExecutiveAction: vi.fn(async () => ({
        kind: "resumed_interrupted_goal" as const,
        wakeAction: {
          kind: "resume_interrupted_goal" as const,
          reason: "verified_failure_requires_followup",
          goalTask: "patch target file",
          goalTargets: ["src/omega/heartbeat.ts"],
          failureStreak: 1,
          suggestedRoute: "omega_delegate" as const,
        },
        route: "omega_delegate" as const,
        status: "ok" as const,
        observedChangedFiles: ["src/omega/heartbeat.ts"],
      })),
    });

    const result = await runOneHeartbeatCycleWithDeps({ workspaceRoot, sessionKey: "main" }, deps);

    expect(result).toMatchObject({
      iterations: 0,
      stopReason: "structured_idle",
      lastWakeActionKind: "resume_interrupted_goal",
    });
    expect(deps.buildPrompt).not.toHaveBeenCalled();
    expect(deps.sendAgentTurn).not.toHaveBeenCalled();

    const metrics = await loadOmegaEmpiricalMetrics({ workspaceRoot });
    expect(metrics.heartbeat).toMatchObject({
      cyclesStarted: 1,
      cyclesCompleted: 1,
      executiveActions: 1,
      usefulExecutiveActions: 1,
      structuredTerminations: 1,
      iterations: 0,
    });
  });

  it("uses the latest assistant reply for HEARTBEAT_OK fallback instead of timeline text", async () => {
    const workspaceRoot = await createWorkspaceRoot();
    const snapshots: OmegaHeartbeatRuntimeSnapshot[] = [
      {
        timeline: [],
        kernel: makeKernel(),
      },
      {
        timeline: [],
        kernel: makeKernel(),
      },
    ];
    const deps = createDeps({
      loadRuntimeSnapshot: vi.fn(async () => snapshots.shift() ?? snapshots[0]!),
      readLatestReply: vi.fn(async () => "finished cleanly HEARTBEAT_OK"),
    });

    const result = await runOneHeartbeatCycleWithDeps({ workspaceRoot, sessionKey: "main" }, deps);

    expect(result).toMatchObject({
      iterations: 1,
      stopReason: "reply_heartbeat_ok",
    });
    expect(deps.sendAgentTurn).toHaveBeenCalledTimes(1);
    expect(deps.sleep).not.toHaveBeenCalled();

    const metrics = await loadOmegaEmpiricalMetrics({ workspaceRoot });
    expect(metrics.heartbeat).toMatchObject({
      cyclesStarted: 1,
      cyclesCompleted: 1,
      textTokenTerminations: 1,
      iterations: 1,
    });
    expect(deps.recordMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceRoot,
        entry: expect.objectContaining({
          kind: "heartbeat_iteration",
          terminationReason: "reply_heartbeat_ok",
          progressObserved: false,
          latencyBreakdown: expect.objectContaining({
            sendAgentTurnMs: expect.any(Number),
            loadSnapshotMs: expect.any(Number),
            readLatestReplyMs: expect.any(Number),
            totalMs: expect.any(Number),
          }),
        }),
      }),
    );
  });

  it("prefers structured idle detection before the HEARTBEAT_OK fallback", () => {
    const decision = deriveOmegaHeartbeatTurnDecision({
      previousTimelineLength: 1,
      previousKernelUpdatedAt: 10,
      latestReply: "HEARTBEAT_OK",
      nextSnapshot: {
        timeline: [
          {
            createdAt: 2,
            task: "idle",
            validation: { expectsJson: false, expectedKeys: [], expectedPaths: [] },
            outcome: { status: "ok" },
          },
        ],
        kernel: makeKernel({
          turnCount: 2,
          identity: { continuityId: "cid", firstSeenAt: 1, lastSeenAt: 2 },
          updatedAt: 11,
        }),
      },
    });

    expect(decision).toMatchObject({
      shouldContinue: false,
      stopReason: "structured_idle",
      replyHeartbeatOk: true,
      structuredIdleDetected: true,
    });
  });

  it("does not stop on timeline reply text without a fresh assistant reply read", () => {
    const goal = {
      id: "goal-1",
      task: "continue heartbeat work",
      targets: ["src/omega/heartbeat.ts"],
      requiredKeys: [],
      status: "active" as const,
      createdAt: 1,
      updatedAt: 1,
      createdTurn: 1,
      updatedTurn: 1,
      failureCount: 0,
      successCount: 0,
      observedChangedFiles: [],
    };
    const decision = deriveOmegaHeartbeatTurnDecision({
      previousTimelineLength: 1,
      previousKernelUpdatedAt: 10,
      nextSnapshot: {
        timeline: [
          {
            createdAt: 2,
            task: "idle",
            validation: { expectsJson: false, expectedKeys: [], expectedPaths: [] },
            outcome: { status: "ok" },
            reply: "HEARTBEAT_OK",
          },
        ],
        kernel: makeKernel({
          turnCount: 2,
          activeGoalId: goal.id,
          identity: { continuityId: "cid", firstSeenAt: 1, lastSeenAt: 2 },
          goals: [goal],
          tension: {
            openGoalCount: 1,
            staleGoalCount: 0,
            failureStreak: 0,
            repeatedFailureKinds: [],
            pendingCorrection: true,
          },
          updatedAt: 11,
        }),
      },
    });

    expect(decision).toMatchObject({
      shouldContinue: true,
      replyHeartbeatOk: false,
      structuredIdleDetected: false,
    });
  });

  it("opens a proactive probe experiment after repeated failures without requiring new user input", async () => {
    const workspaceRoot = await createWorkspaceRoot();
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "main",
      task: "arregla solo el modulo",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: ["src/app.ts"],
      },
      outcome: {
        status: "error",
        errorKind: "target_not_touched",
        observedChangedFiles: [],
        writeOk: false,
      },
    });
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "main",
      task: "arregla solo el modulo",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: ["src/app.ts"],
      },
      outcome: {
        status: "error",
        errorKind: "target_not_touched",
        observedChangedFiles: [],
        writeOk: false,
      },
    });

    const prompt = await buildOmegaHeartbeatPrompt({
      workspaceRoot,
      sessionKey: "main",
    });

    expect(prompt).toContain("[OMEGA Initiative Contract]");
    expect(prompt).toContain("probe_experiment");
    expect(prompt).toContain("SURGICAL EXPERIMENT CONSTRAINTS:");
    expect(prompt).toContain("NO REPAIR");
  });

  it("skips latest-reply reads when structured state already shows idle", async () => {
    const workspaceRoot = await createWorkspaceRoot();
    const snapshots: OmegaHeartbeatRuntimeSnapshot[] = [
      {
        timeline: [],
        kernel: makeKernel({ updatedAt: 10 }),
      },
      {
        timeline: [],
        kernel: makeKernel({ updatedAt: 11 }),
      },
    ];
    const deps = createDeps({
      loadRuntimeSnapshot: vi.fn(async () => snapshots.shift() ?? snapshots[0]!),
      readLatestReply: vi.fn(async () => "HEARTBEAT_OK"),
    });

    const result = await runOneHeartbeatCycleWithDeps({ workspaceRoot, sessionKey: "main" }, deps);

    expect(result).toMatchObject({
      iterations: 1,
      stopReason: "structured_idle",
    });
    expect(deps.readLatestReply).not.toHaveBeenCalled();
  });

  it("does not block the turn on consciousness-log writes", async () => {
    const workspaceRoot = await createWorkspaceRoot();
    let resolveLog: (() => void) | undefined;
    const pendingLog = new Promise<void>((resolve) => {
      resolveLog = resolve;
    });
    const snapshots: OmegaHeartbeatRuntimeSnapshot[] = [
      {
        timeline: [],
        kernel: makeKernel({ updatedAt: 10 }),
      },
      {
        timeline: [],
        kernel: makeKernel({ updatedAt: 11 }),
      },
    ];
    const deps = createDeps({
      loadRuntimeSnapshot: vi.fn(async () => snapshots.shift() ?? snapshots[0]!),
      appendConsciousnessLog: vi.fn(async () => await pendingLog),
      readLatestReply: vi.fn(async () => "HEARTBEAT_OK"),
    });

    const result = await Promise.race([
      runOneHeartbeatCycleWithDeps({ workspaceRoot, sessionKey: "main" }, deps),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("heartbeat cycle timed out waiting on log write")), 100),
      ),
    ]);
    resolveLog?.();

    expect(result).toMatchObject({
      iterations: 1,
      stopReason: "structured_idle",
    });
    expect(deps.sendAgentTurn).toHaveBeenCalledTimes(1);
  });

  it("returns a structured turn result with state delta and latency breakdown", async () => {
    const snapshots: OmegaHeartbeatRuntimeSnapshot[] = [
      {
        timeline: [
          {
            createdAt: 2,
            task: "patch heartbeat loop",
            validation: { expectsJson: false, expectedKeys: [], expectedPaths: [] },
            outcome: { status: "ok" },
          },
        ],
        kernel: makeKernel({ updatedAt: 11 }),
      },
    ];
    const deps = createDeps({
      loadRuntimeSnapshot: vi.fn(async () => snapshots.shift() ?? snapshots[0]!),
      readLatestReply: vi.fn(async () => "HEARTBEAT_OK"),
    });

    const result = await executeOmegaHeartbeatTurnWithDeps(
      {
        workspaceRoot: await createWorkspaceRoot(),
        sessionKey: "main",
        iteration: 1,
        prompt: "heartbeat prompt",
        previousSnapshot: {
          timeline: [],
          kernel: makeKernel({ updatedAt: 10 }),
        },
      },
      deps,
    );

    expect(result).toMatchObject({
      iteration: 1,
      terminationReason: "structured_idle",
      decision: {
        shouldContinue: false,
        stopReason: "structured_idle",
        structuredIdleDetected: true,
      },
      stateDelta: {
        timelineDelta: 1,
        kernelUpdated: true,
        progressObserved: true,
      },
    });
    expect(result.latencyBreakdown.totalMs).toBeGreaterThanOrEqual(0);
    expect(result.latencyBreakdown.sendAgentTurnMs).toBeGreaterThanOrEqual(0);
    expect(result.latencyBreakdown.loadSnapshotMs).toBeGreaterThanOrEqual(0);
    expect(result.latencyBreakdown.readLatestReplyMs).toBe(0);
  });

  it("includes fresh reply fallback details in the structured turn result when state is still ambiguous", async () => {
    const snapshots: OmegaHeartbeatRuntimeSnapshot[] = [
      {
        timeline: [],
        kernel: makeKernel({
          activeGoalId: "goal-1",
          updatedAt: 10,
          tension: {
            openGoalCount: 1,
            staleGoalCount: 0,
            failureStreak: 0,
            repeatedFailureKinds: [],
            pendingCorrection: true,
          },
        }),
      },
    ];
    const deps = createDeps({
      loadRuntimeSnapshot: vi.fn(async () => snapshots.shift() ?? snapshots[0]!),
      readLatestReply: vi.fn(async () => "done HEARTBEAT_OK"),
    });

    const result = await executeOmegaHeartbeatTurnWithDeps(
      {
        workspaceRoot: await createWorkspaceRoot(),
        sessionKey: "main",
        iteration: 1,
        prompt: "heartbeat prompt",
        previousSnapshot: {
          timeline: [],
          kernel: makeKernel({
            activeGoalId: "goal-1",
            updatedAt: 10,
            tension: {
              openGoalCount: 1,
              staleGoalCount: 0,
              failureStreak: 0,
              repeatedFailureKinds: [],
              pendingCorrection: true,
            },
          }),
        },
      },
      deps,
    );

    expect(result).toMatchObject({
      terminationReason: "reply_heartbeat_ok",
      latestReply: "done HEARTBEAT_OK",
      decision: {
        shouldContinue: false,
        stopReason: "reply_heartbeat_ok",
        replyHeartbeatOk: true,
      },
    });
    expect(result.latencyBreakdown.readLatestReplyMs).toBeGreaterThanOrEqual(0);
  });

  it("loads the next snapshot only after the turn dispatch resolves", async () => {
    let releaseSend: (() => void) | undefined;
    let sendResolved = false;
    const deps = createDeps({
      sendAgentTurn: vi.fn(
        async () =>
          await new Promise<void>((resolve) => {
            releaseSend = () => {
              sendResolved = true;
              resolve();
            };
          }),
      ),
      loadRuntimeSnapshot: vi.fn(async () => {
        if (!sendResolved) {
          throw new Error("snapshot read before dispatch commit");
        }
        return {
          timeline: [],
          kernel: makeKernel({ updatedAt: 11 }),
        };
      }),
      readLatestReply: vi.fn(async () => "HEARTBEAT_OK"),
    });

    const turnPromise = executeOmegaHeartbeatTurnWithDeps(
      {
        workspaceRoot: await createWorkspaceRoot(),
        sessionKey: "main",
        iteration: 1,
        prompt: "heartbeat prompt",
        previousSnapshot: {
          timeline: [],
          kernel: makeKernel({ updatedAt: 10 }),
        },
      },
      deps,
    );
    releaseSend?.();
    const result = await turnPromise;

    expect(result.terminationReason).toBe("structured_idle");
    expect(deps.loadRuntimeSnapshot).toHaveBeenCalledTimes(1);
  });

  it("uses a shorter continuation delay after real progress", async () => {
    const workspaceRoot = await createWorkspaceRoot();
    const goal = {
      id: "goal-1",
      task: "patch heartbeat loop",
      targets: ["src/omega/heartbeat.ts"],
      requiredKeys: [],
      status: "active" as const,
      createdAt: 1,
      updatedAt: 1,
      createdTurn: 1,
      updatedTurn: 1,
      failureCount: 0,
      successCount: 0,
      observedChangedFiles: [],
    };
    const snapshots: OmegaHeartbeatRuntimeSnapshot[] = [
      {
        timeline: [],
        kernel: makeKernel({
          activeGoalId: goal.id,
          goals: [goal],
          tension: {
            openGoalCount: 1,
            staleGoalCount: 0,
            failureStreak: 0,
            repeatedFailureKinds: [],
            pendingCorrection: true,
          },
          updatedAt: 10,
        }),
      },
      {
        timeline: [
          {
            createdAt: 2,
            task: "patch heartbeat loop",
            validation: { expectsJson: false, expectedKeys: [], expectedPaths: [] },
            outcome: { status: "ok" },
          },
        ],
        kernel: makeKernel({
          turnCount: 2,
          activeGoalId: goal.id,
          goals: [goal],
          tension: {
            openGoalCount: 1,
            staleGoalCount: 0,
            failureStreak: 0,
            repeatedFailureKinds: [],
            pendingCorrection: true,
          },
          updatedAt: 11,
        }),
      },
    ];
    const deps = createDeps({
      buildPrompt: vi
        .fn<OmegaHeartbeatCycleDeps["buildPrompt"]>()
        .mockResolvedValueOnce("heartbeat prompt")
        .mockResolvedValueOnce(undefined),
      loadRuntimeSnapshot: vi.fn(async () => snapshots.shift() ?? snapshots[0]!),
      readLatestReply: vi.fn(async () => undefined),
      applyExecutiveAction: vi.fn(async () => ({
        kind: "none" as const,
        wakeAction: {
          kind: "resume_interrupted_goal" as const,
          reason: "followup",
          goalTask: "task",
          goalTargets: [],
          failureStreak: 0,
          suggestedRoute: "omega_delegate" as const,
        },
      })),
    });

    const result = await runOneHeartbeatCycleWithDeps({ workspaceRoot, sessionKey: "main" }, deps);

    expect(result).toMatchObject({
      iterations: 2,
      stopReason: "no_prompt",
      lastWakeActionKind: "resume_interrupted_goal",
    });
    expect(deps.sleep).toHaveBeenCalledWith(
      deriveOmegaHeartbeatContinuationDelay({
        terminationReason: "continue",
        progressObserved: true,
      }),
    );
  });

  it("reframes stalled active goals before another blind retry", async () => {
    const workspaceRoot = await createWorkspaceRoot();
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "main",
      task: "fix module and test together",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: ["workspace/a.py", "workspace/b.py"],
      },
      outcome: {
        status: "error",
        errorKind: "target_not_touched",
        observedChangedFiles: [],
        writeOk: false,
      },
      reply: "failed",
    });
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "main",
      task: "fix module only",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: ["workspace/a.py"],
      },
      outcome: {
        status: "ok",
        observedChangedFiles: ["workspace/a.py"],
        writeOk: true,
      },
      reply: "partial",
    });
    for (let iteration = 1; iteration <= 2; iteration += 1) {
      await recordOmegaOperationalTurnMemory({
        workspaceRoot,
        sessionKey: "main",
        turn: {
          iteration,
          terminationReason: "continue",
          stateDelta: {
            timelineDelta: 0,
            kernelUpdated: false,
            progressObserved: false,
          },
          latencyBreakdown: {
            sendAgentTurnMs: 100,
            loadSnapshotMs: 100,
            readLatestReplyMs: 0,
            totalMs: 500,
          },
          decision: {
            shouldContinue: true,
            stopReason: "continue",
            replyHeartbeatOk: false,
            structuredIdleDetected: false,
          },
        },
      });
    }

    const result = await applyOmegaHeartbeatExecutiveAction({
      workspaceRoot,
      sessionKey: "main",
    });

    expect(result).toMatchObject({
      kind: "reframed_stalled_goal",
      goalTask: "fix module and test together",
      focusedTargets: ["workspace/b.py"],
    });
  });

  it("returns no prompt when the wake policy is already heartbeat_ok", async () => {
    const workspaceRoot = await createWorkspaceRoot();
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "main",
      task: "completed maintenance",
      validation: { expectsJson: false, expectedKeys: [], expectedPaths: [] },
      outcome: { status: "ok" },
      reply: "done",
    });

    const prompt = await buildOmegaHeartbeatPrompt({
      workspaceRoot,
      sessionKey: "main",
    });

    expect(prompt).toBeUndefined();
  });

  it("returns no prompt when the executive dispatch plan defers active work under budget pressure", async () => {
    const workspaceRoot = await createWorkspaceRoot();
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "main",
      task: "repair src/omega/heartbeat.ts",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: ["src/omega/heartbeat.ts"],
      },
      outcome: { status: "error", errorKind: "missing_target_writes" },
      reply: "still pending",
    });
    for (let iteration = 1; iteration <= 3; iteration += 1) {
      await recordOmegaOperationalTurnMemory({
        workspaceRoot,
        sessionKey: "main",
        turn: {
          iteration,
          terminationReason: "continue",
          stateDelta: {
            timelineDelta: 0,
            kernelUpdated: false,
            progressObserved: false,
          },
          latencyBreakdown: {
            sendAgentTurnMs: 100,
            loadSnapshotMs: 100,
            readLatestReplyMs: 100,
            totalMs: 2_000,
          },
          decision: {
            shouldContinue: true,
            stopReason: "continue",
            replyHeartbeatOk: false,
            structuredIdleDetected: false,
          },
        },
      });
    }

    const prompt = await buildOmegaHeartbeatPrompt({
      workspaceRoot,
      sessionKey: "main",
    });

    expect(prompt).toBeUndefined();
  });

  it("builds a prompt when the executive stack selects maintenance despite heartbeat_ok", async () => {
    const workspaceRoot = await createWorkspaceRoot();
    vi.spyOn(executionController, "syncOmegaExecutionControllerState").mockResolvedValue({
      executiveState: {
        sessionKey: "main",
        updatedAt: 1,
        observer: {
          mode: "idle",
          queue: [],
          maintenanceQueue: [],
          anomalies: [],
          decision: {
            mode: "idle",
            selectedAction: "maintain",
            rationale: [],
            expectedUtility: 0.7,
            utilityBreakdown: {
              uncertaintyReduction: 0.2,
            } as any,
            confidence: 0.8,
            budget: {
              maxTurnsPerCycle: 1,
              maxLlmCalls: 1,
              maxWallTimeMs: 5000,
            },
            budgetUsage: {
              observedTurns: 0,
              observedWallTimeMs: 0,
              budgetPressure: 0.1,
              estimatedLlmCalls: 1,
            },
          },
        },
        memory: {
          durableEntries: 0,
          operationalSignals: 0,
          repeatedFailures: 0,
          revalidationCandidates: 0,
        },
        runtime: {
          lastSyncedAt: 1,
          dispatchPlan: {
            shouldDispatchLlmTurn: true,
            selectedAction: "maintain",
            queueKind: "maintenance",
            selectedWorkItemId: "maintenance:agenda:failure:heartbeat",
            expectedUtility: 0.7,
            utilityBreakdown: {
              uncertaintyReduction: 0.2,
            } as any,
            budgetUsage: {
              observedTurns: 0,
              observedWallTimeMs: 0,
              budgetPressure: 0.1,
              estimatedLlmCalls: 1,
            } as any,
            estimatedDispatchCostMs: 1000,
            queueDepths: { goals: 0, anomalies: 0, maintenance: 1 },
            scheduledItems: [
              {
                id: "maintenance:agenda:failure:heartbeat",
                queueKind: "maintenance",
                action: "maintain",
                priority: 0.8,
                detail: "Investigate stalled autonomous progress and reframe the active plan",
              },
            ],
            nextWakeDelayMs: 1000,
            rationale: [],
          },
          dispatchAccounting: {
            totalCycles: 0,
            llmDispatches: 0,
            deferredCycles: 0,
            queueDispatchCounts: { goal: 0, maintenance: 0, anomaly: 0 },
            recentSelectedWorkItemIds: [],
            recentDispatchedWorkItemIds: [],
            workItemLedger: [],
          },
        },
      },
      dispatchPlan: {
        shouldDispatchLlmTurn: true,
        selectedAction: "maintain",
        queueKind: "maintenance",
        selectedWorkItemId: "maintenance:agenda:failure:heartbeat",
        expectedUtility: 0.7,
        utilityBreakdown: {
          uncertaintyReduction: 0.2,
        } as any,
        budgetUsage: {
          observedTurns: 0,
          observedWallTimeMs: 0,
          budgetPressure: 0.1,
          estimatedLlmCalls: 1,
        } as any,
        estimatedDispatchCostMs: 1000,
        queueDepths: { goals: 0, anomalies: 0, maintenance: 1 },
        scheduledItems: [
          {
            id: "maintenance:agenda:failure:heartbeat",
            queueKind: "maintenance",
            action: "maintain",
            priority: 0.8,
            detail: "Investigate stalled autonomous progress and reframe the active plan",
          },
        ],
        nextWakeDelayMs: 1000,
        rationale: [],
      },
      selectedWorkItem: {
        id: "maintenance:agenda:failure:heartbeat",
        queueKind: "maintenance",
        action: "maintain",
        priority: 0.8,
        detail: "Investigate stalled autonomous progress and reframe the active plan",
      },
      hasUrgentMaintenance: true,
      operationalSummary: undefined,
      worldSnapshot: undefined,
    } as any);

    const prompt = await buildOmegaHeartbeatPrompt({
      workspaceRoot,
      sessionKey: "main",
    });

    expect(prompt).toContain("Wake action: maintain");
    expect(prompt).toContain("Executive work item: Investigate stalled autonomous progress");
  });
});
