import {
  evaluateInnerDrivesFromWSP,
  type InnerDriveSignal,
} from "../../omega/inner-life/drives.js";
import type { OmegaWorldStatePersistent, WspDriveState } from "../../omega/omega-wsp.js";
import type { OmegaSelfTimeKernelState } from "../../omega/self-time-kernel.js";

const NOW = 1_700_000_000_000;
const DRIVE_ACTIVATION_THRESHOLD = 0.15;
const MIN_IDLE_MS_BEFORE_DRIVE = 30 * 1000;

type Scenario = {
  name: string;
  expectedKind: InnerDriveSignal["kind"];
  kernel: OmegaSelfTimeKernelState;
  wsp: OmegaWorldStatePersistent;
  memoryCandidates?: string[];
};

function makeKernel(overrides: Partial<OmegaSelfTimeKernelState> = {}): OmegaSelfTimeKernelState {
  return {
    revision: 2,
    sessionKey: "agent:main:main",
    turnCount: 12,
    activeGoalId: undefined,
    identity: {
      continuityId: "cid",
      firstSeenAt: NOW - 45_000,
      lastSeenAt: NOW - 45_000,
      lastTask: "auditar runtime",
      lastInteractionKind: "direct_instruction",
    },
    world: {
      lastOutcomeStatus: "ok",
      lastObservedChangedFiles: [],
    },
    goals: [],
    tension: {
      openGoalCount: 0,
      staleGoalCount: 0,
      failureStreak: 0,
      repeatedFailureKinds: [],
      pendingCorrection: false,
    },
    causalGraph: {
      files: [],
      edges: [],
    },
    updatedAt: NOW - 45_000,
    ...overrides,
  };
}

function makeDrive(
  name: WspDriveState["name"],
  error: number,
  currentLevel: number,
  setpoint: number,
): WspDriveState {
  return {
    name,
    setpoint,
    currentLevel,
    error,
    decayRate: 0.02,
    lastSatisfiedAt: NOW - 60_000,
  };
}

function makeWsp(drives: WspDriveState[]): OmegaWorldStatePersistent {
  return {
    version: 1,
    sessionKey: "agent:main:main",
    createdAt: NOW - 60_000,
    updatedAt: NOW - 1_000,
    updateCount: 4,
    beliefs: [],
    drives,
    tensions: [],
    causalEdges: [],
  };
}

function legacyEvaluateInnerDrivesFromWSP(params: {
  wsp: OmegaWorldStatePersistent;
  kernel: OmegaSelfTimeKernelState;
  nowMs?: number;
  memoryCandidates?: string[];
}): InnerDriveSignal {
  const nowMs = params.nowMs ?? Date.now();
  const { wsp, kernel, memoryCandidates = [] } = params;
  const activeDrives = wsp.drives
    .filter((d) => d.error > DRIVE_ACTIVATION_THRESHOLD)
    .sort((a, b) => b.error - a.error);

  if (activeDrives.length === 0) {
    return { kind: "idle" };
  }

  const drive = activeDrives[0];
  const urgency = Math.min(0.95, drive.error);

  switch (drive.name) {
    case "homeostasis":
      return { kind: "homeostasis", reason: "legacy", urgency };
    case "curiosity": {
      const silentMs = nowMs - kernel.identity.lastSeenAt;
      if (silentMs < MIN_IDLE_MS_BEFORE_DRIVE) {
        return { kind: "idle" };
      }
      return {
        kind: "curiosity",
        target: memoryCandidates[0] ?? "memory/omega-episodes",
        reason: "legacy",
        urgency,
      };
    }
    case "integrity": {
      return {
        kind: "entropy_alert",
        silentMs: nowMs - kernel.identity.lastSeenAt,
        reason: "legacy",
        urgency,
      };
    }
    case "competence":
      return { kind: "competence_drive", reason: "legacy", urgency };
    default:
      return { kind: "idle" };
  }
}

const scenarios: Scenario[] = [
  {
    name: "curiosity_top_but_active_goal_should_not_mask_homeostasis",
    expectedKind: "homeostasis",
    kernel: makeKernel({ activeGoalId: "g1" }),
    wsp: makeWsp([
      makeDrive("curiosity", 0.55, 0.05, 0.6),
      makeDrive("homeostasis", 0.4, 0.5, 0.9),
      makeDrive("competence", 0.3, 0.4, 0.7),
      makeDrive("integrity", 0.0, 0.8, 0.8),
    ]),
    memoryCandidates: ["memory/ideas.md"],
  },
  {
    name: "curiosity_top_but_recent_session_should_not_force_idle",
    expectedKind: "competence_drive",
    kernel: makeKernel({
      identity: {
        continuityId: "cid",
        firstSeenAt: NOW - 20_000,
        lastSeenAt: NOW - 20_000,
        lastTask: "auditar runtime",
        lastInteractionKind: "direct_instruction",
      },
    }),
    wsp: makeWsp([
      makeDrive("curiosity", 0.55, 0.05, 0.6),
      makeDrive("competence", 0.35, 0.35, 0.7),
      makeDrive("homeostasis", 0.0, 0.9, 0.9),
      makeDrive("integrity", 0.0, 0.8, 0.8),
    ]),
    memoryCandidates: ["memory/ideas.md"],
  },
  {
    name: "integrity_should_wait_for_real_silence",
    expectedKind: "idle",
    kernel: makeKernel({
      identity: {
        continuityId: "cid",
        firstSeenAt: NOW - 40_000,
        lastSeenAt: NOW - 40_000,
        lastTask: "auditar runtime",
        lastInteractionKind: "direct_instruction",
      },
    }),
    wsp: makeWsp([
      makeDrive("integrity", 0.7, 0.1, 0.8),
      makeDrive("curiosity", 0.05, 0.55, 0.6),
      makeDrive("competence", 0.0, 0.7, 0.7),
      makeDrive("homeostasis", 0.0, 0.9, 0.9),
    ]),
  },
  {
    name: "curiosity_still_works_when_context_allows_it",
    expectedKind: "curiosity",
    kernel: makeKernel({
      activeGoalId: undefined,
      goals: [
        {
          id: "g-old",
          task: "old goal",
          targets: [],
          requiredKeys: [],
          status: "completed",
          createdAt: NOW - 120_000,
          updatedAt: NOW - 120_000,
          createdTurn: 1,
          updatedTurn: 1,
          failureCount: 0,
          successCount: 1,
          lastOutcomeStatus: "ok",
          observedChangedFiles: [],
        },
      ],
    }),
    wsp: makeWsp([
      makeDrive("curiosity", 0.55, 0.05, 0.6),
      makeDrive("integrity", 0.0, 0.8, 0.8),
      makeDrive("competence", 0.0, 0.7, 0.7),
      makeDrive("homeostasis", 0.0, 0.9, 0.9),
    ]),
    memoryCandidates: ["memory/ideas.md"],
  },
];

function run() {
  const legacyCorrect = scenarios.filter((scenario) => {
    const result = legacyEvaluateInnerDrivesFromWSP({
      wsp: scenario.wsp,
      kernel: scenario.kernel,
      nowMs: NOW,
      memoryCandidates: scenario.memoryCandidates,
    });
    return result.kind === scenario.expectedKind;
  }).length;

  const candidateCorrect = scenarios.filter((scenario) => {
    const result = evaluateInnerDrivesFromWSP({
      wsp: scenario.wsp,
      kernel: scenario.kernel,
      nowMs: NOW,
      memoryCandidates: scenario.memoryCandidates,
    });
    return result.kind === scenario.expectedKind;
  }).length;

  const report = {
    experiment: "wsp_drive_policy_01",
    samples: scenarios.length,
    legacyAccuracy: legacyCorrect / scenarios.length,
    candidateAccuracy: candidateCorrect / scenarios.length,
    delta: (candidateCorrect - legacyCorrect) / scenarios.length,
    scenarios: scenarios.map((scenario) => ({
      name: scenario.name,
      expectedKind: scenario.expectedKind,
      legacyKind: legacyEvaluateInnerDrivesFromWSP({
        wsp: scenario.wsp,
        kernel: scenario.kernel,
        nowMs: NOW,
        memoryCandidates: scenario.memoryCandidates,
      }).kind,
      candidateKind: evaluateInnerDrivesFromWSP({
        wsp: scenario.wsp,
        kernel: scenario.kernel,
        nowMs: NOW,
        memoryCandidates: scenario.memoryCandidates,
      }).kind,
    })),
  };

  console.log(JSON.stringify(report, null, 2));
}

run();
