import { describe, expect, it } from "vitest";
import type { OmegaSelfTimeKernelState } from "../self-time-kernel.js";
import { decideOmegaWakeAction } from "./wake-policy.js";

function makeKernel(overrides?: Partial<OmegaSelfTimeKernelState>): OmegaSelfTimeKernelState {
  return {
    revision: 2,
    sessionKey: "main",
    turnCount: 3,
    activeGoalId: "goal-1",
    identity: {
      continuityId: "abc",
      firstSeenAt: 1,
      lastSeenAt: 3,
      lastTask: "patch target file",
      lastInteractionKind: "corrective_feedback",
    },
    world: {
      lastOutcomeStatus: "error",
      lastErrorKind: "target_not_touched",
      lastObservedChangedFiles: [],
      lastWriteOk: false,
    },
    goals: [
      {
        id: "goal-1",
        task: "patch target file",
        targets: ["workspace/file.py"],
        requiredKeys: [],
        status: "active",
        createdAt: 1,
        updatedAt: 3,
        createdTurn: 1,
        updatedTurn: 3,
        failureCount: 2,
        successCount: 0,
        lastOutcomeStatus: "error",
        lastErrorKind: "target_not_touched",
        lastInteractionKind: "corrective_feedback",
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
    causalGraph: {
      files: [],
      edges: [],
    },
    updatedAt: 3,
    ...overrides,
  };
}

describe("omega wake policy", () => {
  it("aborts autonomous interrupted-goal recovery when verified failure streak is too high", () => {
    const action = decideOmegaWakeAction({
      kernel: makeKernel(),
    });

    expect(action).toEqual({
      kind: "abort_interrupted_goal",
      reason: "failure_streak_too_high",
      goalTask: "patch target file",
      goalTargets: ["workspace/file.py"],
      failureStreak: 2,
      suggestedRoute: "sessions_spawn",
      errorKind: "target_not_touched",
    });
  });

  it("emits an explicit interrupted-goal recovery action when verified work is still resumable", () => {
    const action = decideOmegaWakeAction({
      kernel: makeKernel({
        goals: [
          {
            ...makeKernel().goals[0],
            failureCount: 1,
          },
        ],
        tension: {
          openGoalCount: 1,
          staleGoalCount: 0,
          failureStreak: 1,
          repeatedFailureKinds: ["target_not_touched"],
          pendingCorrection: true,
        },
      }),
    });

    expect(action).toEqual({
      kind: "resume_interrupted_goal",
      reason: "verified_write_failure_after_restart",
      goalTask: "patch target file",
      goalTargets: ["workspace/file.py"],
      failureStreak: 1,
      suggestedRoute: "sessions_spawn",
      errorKind: "target_not_touched",
    });
  });

  it("falls back to active-goal review when the open goal has no concrete resume targets", () => {
    const action = decideOmegaWakeAction({
      kernel: makeKernel({
        goals: [
          {
            ...makeKernel().goals[0],
            task: "investigate flaky behavior",
            targets: [],
            lastErrorKind: undefined,
          },
        ],
        world: {
          ...makeKernel().world,
          lastErrorKind: undefined,
        },
      }),
    });

    expect(action).toEqual({
      kind: "review_active_goal",
      reason: "verified_failure_requires_followup",
      goalTask: "investigate flaky behavior",
    });
  });

  it("prioritizes stale-goal garbage collection when stale goals exist", () => {
    const action = decideOmegaWakeAction({
      kernel: makeKernel({
        activeGoalId: undefined,
        goals: [
          {
            ...makeKernel().goals[0],
            id: "goal-stale",
            task: "obsolete probe",
            status: "stale",
          },
        ],
        tension: {
          openGoalCount: 0,
          staleGoalCount: 1,
          failureStreak: 0,
          repeatedFailureKinds: [],
          pendingCorrection: false,
        },
      }),
    });

    expect(action).toEqual({
      kind: "prune_stale_goals",
      reason: "stale_goal_gc_due",
      goalTasks: ["obsolete probe"],
    });
  });

  it("prioritizes interrupted-goal recovery over stale-goal garbage collection", () => {
    const action = decideOmegaWakeAction({
      kernel: makeKernel({
        activeGoalId: "goal-1",
        goals: [
          makeKernel().goals[0],
          {
            ...makeKernel().goals[0],
            id: "goal-stale",
            task: "old cleanup",
            status: "stale",
            targets: ["workspace/old.py"],
          },
        ],
        tension: {
          openGoalCount: 1,
          staleGoalCount: 1,
          failureStreak: 1,
          repeatedFailureKinds: ["target_not_touched"],
          pendingCorrection: true,
        },
      }),
    });

    expect(action).toEqual({
      kind: "resume_interrupted_goal",
      reason: "verified_write_failure_after_restart",
      goalTask: "patch target file",
      goalTargets: ["workspace/file.py"],
      failureStreak: 1,
      suggestedRoute: "sessions_spawn",
      errorKind: "target_not_touched",
    });
  });

  it("prioritizes active-goal review over stale-goal garbage collection", () => {
    const action = decideOmegaWakeAction({
      kernel: makeKernel({
        goals: [
          {
            ...makeKernel().goals[0],
            task: "investigate flaky behavior",
            targets: [],
            lastErrorKind: undefined,
          },
          {
            ...makeKernel().goals[0],
            id: "goal-stale",
            task: "old cleanup",
            status: "stale",
            targets: ["workspace/old.py"],
          },
        ],
        world: {
          ...makeKernel().world,
          lastErrorKind: undefined,
        },
      }),
    });

    expect(action).toEqual({
      kind: "review_active_goal",
      reason: "verified_failure_requires_followup",
      goalTask: "investigate flaky behavior",
    });
  });

  it("prunes superseded active goals before asking for manual follow-up", () => {
    const action = decideOmegaWakeAction({
      kernel: makeKernel({
        activeGoalId: "goal-multi",
        goals: [
          {
            ...makeKernel().goals[0],
            id: "goal-multi",
            task: "fix module and test together",
            targets: ["workspace/a.py", "workspace/b.py"],
          },
          {
            ...makeKernel().goals[0],
            id: "goal-a",
            task: "fix module only",
            status: "completed",
            targets: ["workspace/a.py"],
            updatedTurn: 4,
          },
          {
            ...makeKernel().goals[0],
            id: "goal-b",
            task: "fix test only",
            status: "completed",
            targets: ["workspace/b.py"],
            updatedTurn: 5,
          },
        ],
        causalGraph: {
          files: [
            {
              path: "workspace/a.py",
              lastWriteTurn: 4,
              lastWriteAt: 4,
              lastWriterGoalId: "goal-a",
              writeCount: 1,
              failureCount: 0,
            },
            {
              path: "workspace/b.py",
              lastWriteTurn: 5,
              lastWriteAt: 5,
              lastWriterGoalId: "goal-b",
              writeCount: 1,
              failureCount: 0,
            },
          ],
          edges: [],
        },
      }),
    });

    expect(action).toEqual({
      kind: "prune_superseded_goals",
      reason: "superseded_goal_gc_due",
      goalTasks: ["fix module and test together"],
    });
  });

  it("focuses the active goal on unresolved targets after verified partial progress", () => {
    const action = decideOmegaWakeAction({
      kernel: makeKernel({
        activeGoalId: "goal-multi",
        goals: [
          {
            ...makeKernel().goals[0],
            id: "goal-multi",
            task: "fix module and test together",
            targets: ["workspace/a.py", "workspace/b.py"],
          },
          {
            ...makeKernel().goals[0],
            id: "goal-a",
            task: "fix module only",
            status: "completed",
            targets: ["workspace/a.py"],
            updatedTurn: 4,
          },
        ],
        causalGraph: {
          files: [
            {
              path: "workspace/a.py",
              lastWriteTurn: 4,
              lastWriteAt: 4,
              lastWriterGoalId: "goal-a",
              writeCount: 1,
              failureCount: 0,
            },
            {
              path: "workspace/b.py",
              writeCount: 0,
              failureCount: 0,
            },
          ],
          edges: [],
        },
      }),
    });

    expect(action).toEqual({
      kind: "focus_active_goal_targets",
      reason: "verified_partial_progress_detected",
      goalTask: "fix module and test together",
      goalTargets: ["workspace/b.py"],
    });
  });

  it("prunes broad shadowed goals when a newer active subgoal covers the unresolved remainder", () => {
    const action = decideOmegaWakeAction({
      kernel: makeKernel({
        activeGoalId: "goal-b",
        goals: [
          {
            ...makeKernel().goals[0],
            id: "goal-multi",
            task: "fix module and test together",
            targets: ["workspace/a.py", "workspace/b.py"],
            updatedTurn: 1,
          },
          {
            ...makeKernel().goals[0],
            id: "goal-a",
            task: "fix module only",
            status: "completed",
            targets: ["workspace/a.py"],
            updatedTurn: 4,
          },
          {
            ...makeKernel().goals[0],
            id: "goal-b",
            task: "fix test only",
            status: "active",
            targets: ["workspace/b.py"],
            updatedTurn: 5,
          },
        ],
        causalGraph: {
          files: [
            {
              path: "workspace/a.py",
              lastWriteTurn: 4,
              lastWriteAt: 4,
              lastWriterGoalId: "goal-a",
              writeCount: 1,
              failureCount: 0,
            },
            {
              path: "workspace/b.py",
              lastFailureTurn: 5,
              lastFailureAt: 5,
              lastFailedGoalId: "goal-b",
              lastFailureKind: "target_not_touched",
              writeCount: 0,
              failureCount: 1,
            },
          ],
          edges: [],
        },
      }),
    });

    expect(action).toEqual({
      kind: "prune_shadowed_goals",
      reason: "shadowed_goal_gc_due",
      goalTasks: ["fix module and test together"],
    });
  });

  it("stays quiet when there is no verified tension", () => {
    const action = decideOmegaWakeAction({
      kernel: makeKernel({
        activeGoalId: undefined,
        goals: [],
        tension: {
          openGoalCount: 0,
          staleGoalCount: 0,
          failureStreak: 0,
          repeatedFailureKinds: [],
          pendingCorrection: false,
        },
      }),
    });

    expect(action).toEqual({
      kind: "heartbeat_ok",
      reason: "no_verified_tension",
    });
  });
});
