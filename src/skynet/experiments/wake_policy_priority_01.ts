import { decideOmegaWakeAction, type OmegaWakeAction } from "../../omega/frontal/wake-policy.js";
import type { OmegaSelfTimeKernelState } from "../../omega/self-time-kernel.js";

const NOW = 10;

type Scenario = {
  name: string;
  expectedKind: OmegaWakeAction["kind"];
  kernel: OmegaSelfTimeKernelState;
};

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
        failureCount: 1,
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
      failureStreak: 1,
      repeatedFailureKinds: ["target_not_touched"],
      pendingCorrection: true,
    },
    causalGraph: {
      files: [],
      edges: [],
    },
    updatedAt: NOW,
    ...overrides,
  };
}

function legacyDecideOmegaWakeAction(params: {
  kernel?: OmegaSelfTimeKernelState;
}): OmegaWakeAction {
  const kernel = params.kernel;
  if (!kernel) {
    return { kind: "heartbeat_ok", reason: "no_kernel_state" };
  }

  const staleGoals = kernel.goals.filter((goal) => goal.status === "stale");
  if (staleGoals.length > 0) {
    return {
      kind: "prune_stale_goals",
      reason: "stale_goal_gc_due",
      goalTasks: staleGoals.map((goal) => goal.task),
    };
  }

  const activeGoal = kernel.activeGoalId
    ? kernel.goals.find((goal) => goal.id === kernel.activeGoalId)
    : undefined;
  if (kernel.tension.pendingCorrection && activeGoal) {
    if (kernel.tension.failureStreak > 0 && activeGoal.targets.length > 0) {
      return {
        kind:
          kernel.tension.failureStreak > 1 ? "abort_interrupted_goal" : "resume_interrupted_goal",
        reason:
          kernel.tension.failureStreak > 1
            ? "failure_streak_too_high"
            : "verified_write_failure_after_restart",
        goalTask: activeGoal.task,
        goalTargets: activeGoal.targets,
        failureStreak: kernel.tension.failureStreak,
        suggestedRoute: "sessions_spawn",
        errorKind: activeGoal.lastErrorKind ?? kernel.world.lastErrorKind,
      };
    }
    return {
      kind: "review_active_goal",
      reason: "verified_failure_requires_followup",
      goalTask: activeGoal.task,
    };
  }

  return { kind: "heartbeat_ok", reason: "no_verified_tension" };
}

const scenarios: Scenario[] = [
  {
    name: "stale_background_should_not_mask_resume",
    expectedKind: "resume_interrupted_goal",
    kernel: makeKernel({
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
  },
  {
    name: "stale_background_should_not_mask_review",
    expectedKind: "review_active_goal",
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
  },
  {
    name: "pure_stale_gc_still_runs",
    expectedKind: "prune_stale_goals",
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
  },
];

function run() {
  const legacyCorrect = scenarios.filter(
    (scenario) =>
      legacyDecideOmegaWakeAction({ kernel: scenario.kernel }).kind === scenario.expectedKind,
  ).length;
  const candidateCorrect = scenarios.filter(
    (scenario) => decideOmegaWakeAction({ kernel: scenario.kernel }).kind === scenario.expectedKind,
  ).length;

  console.log(
    JSON.stringify(
      {
        experiment: "wake_policy_priority_01",
        samples: scenarios.length,
        legacyAccuracy: legacyCorrect / scenarios.length,
        candidateAccuracy: candidateCorrect / scenarios.length,
        delta: (candidateCorrect - legacyCorrect) / scenarios.length,
        scenarios: scenarios.map((scenario) => ({
          name: scenario.name,
          expectedKind: scenario.expectedKind,
          legacyKind: legacyDecideOmegaWakeAction({ kernel: scenario.kernel }).kind,
          candidateKind: decideOmegaWakeAction({ kernel: scenario.kernel }).kind,
        })),
      },
      null,
      2,
    ),
  );
}

run();
