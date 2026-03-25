import {
  mergeOmegaDriveSignalWithEngineScore,
  scoreOmegaEngineSignals,
} from "../../src/omega/engines/score-engine-signal.js";
import type { OmegaEngineSignal } from "../../src/omega/engines/types.js";
import {
  evaluateInnerDrives,
  evaluateInnerDrivesFromWSP,
  type InnerDriveSignal,
} from "../../src/omega/inner-life/index.js";
import type { OmegaWorldStatePersistent } from "../../src/omega/omega-wsp.js";
import { deriveOmegaPolicySnapshot } from "../../src/omega/policy-engine.js";
import type { OmegaSelfTimeKernelState } from "../../src/omega/self-time-kernel.js";

type ExpectedDrive = {
  kind: InnerDriveSignal["kind"];
  source?: "kernel" | "omega-wsp";
  minUrgency?: number;
};

type AuthorityScenario = {
  name: string;
  kernel?: OmegaSelfTimeKernelState;
  wsp?: OmegaWorldStatePersistent;
  expected: ExpectedDrive;
};

type SignalScenario = {
  name: string;
  baseDriveSignal: InnerDriveSignal;
  signals: OmegaEngineSignal[];
  expected: ExpectedDrive;
};

export type OmegaSignalAuthorityBenchmarkSummary = {
  authority: {
    moduleHits: number;
    baselineHits: number;
    total: number;
    netImprovement: number;
  };
  signalScoring: {
    moduleHits: number;
    baselineHits: number;
    total: number;
    netImprovement: number;
  };
  targetedImprovementValidated: boolean;
};

function makeKernel(overrides: Partial<OmegaSelfTimeKernelState> = {}): OmegaSelfTimeKernelState {
  return {
    revision: 2,
    sessionKey: "main",
    turnCount: 8,
    activeGoalId: undefined,
    identity: {
      continuityId: "cid",
      firstSeenAt: 1,
      lastSeenAt: 1,
      lastTask: "review memory",
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
    updatedAt: 1,
    ...overrides,
  };
}

function makeWsp(overrides: Partial<OmegaWorldStatePersistent> = {}): OmegaWorldStatePersistent {
  return {
    version: 1,
    sessionKey: "main",
    createdAt: 1,
    updatedAt: 2,
    updateCount: 1,
    beliefs: [],
    drives: [
      {
        name: "curiosity",
        setpoint: 0.6,
        currentLevel: 0.1,
        error: 0.5,
        decayRate: 0.02,
        lastSatisfiedAt: 1,
      },
      {
        name: "integrity",
        setpoint: 0.8,
        currentLevel: 0.8,
        error: 0,
        decayRate: 0.005,
        lastSatisfiedAt: 1,
      },
      {
        name: "competence",
        setpoint: 0.7,
        currentLevel: 0.7,
        error: 0,
        decayRate: 0.01,
        lastSatisfiedAt: 1,
      },
      {
        name: "homeostasis",
        setpoint: 0.9,
        currentLevel: 0.9,
        error: 0,
        decayRate: 0.03,
        lastSatisfiedAt: 1,
      },
    ],
    tensions: [],
    causalEdges: [],
    ...overrides,
  };
}

function buildAuthorityScenarios(): AuthorityScenario[] {
  return [
    {
      name: "fresh-wsp-does-not-suppress-kernel-entropy",
      kernel: makeKernel(),
      wsp: makeWsp({
        updateCount: 0,
        drives: makeWsp().drives.map((drive) => ({
          ...drive,
          currentLevel: drive.setpoint,
          error: 0,
        })),
      }),
      expected: {
        kind: "entropy_alert",
        source: "kernel",
      },
    },
    {
      name: "fresh-wsp-does-not-hide-kernel-homeostasis",
      kernel: makeKernel({
        tension: {
          openGoalCount: 0,
          staleGoalCount: 0,
          failureStreak: 2,
          repeatedFailureKinds: ["target_not_touched"],
          pendingCorrection: true,
        },
      }),
      wsp: makeWsp({
        updateCount: 0,
        drives: makeWsp().drives.map((drive) => ({
          ...drive,
          currentLevel: drive.setpoint,
          error: 0,
        })),
      }),
      expected: {
        kind: "homeostasis",
        source: "kernel",
      },
    },
    {
      name: "calibrated-wsp-curiosity-takes-authority",
      kernel: makeKernel(),
      wsp: makeWsp(),
      expected: {
        kind: "curiosity",
        source: "omega-wsp",
      },
    },
    {
      name: "kernel-only-still-works-without-wsp",
      kernel: makeKernel(),
      expected: {
        kind: "entropy_alert",
        source: "kernel",
      },
    },
  ];
}

function buildSignalScenarios(): SignalScenario[] {
  return [
    {
      name: "strong-contradiction-activates-homeostasis",
      baseDriveSignal: { kind: "idle" },
      signals: [
        {
          source: "entropy-minimization",
          kind: "contradiction",
          severity: 0.5,
          summary: "stale goals contradict claimed completion",
          contradictionKind: "goal_state_mismatch",
        },
      ],
      expected: {
        kind: "homeostasis",
        minUrgency: 0.55,
      },
    },
    {
      name: "low-speculation-stays-idle",
      baseDriveSignal: { kind: "idle" },
      signals: [
        {
          source: "continuous-thinking",
          kind: "thought",
          severity: 0.3,
          summary: "what single question would reduce uncertainty most?",
          thoughtId: "thought_1",
          drive: "adaptive_depth",
        },
      ],
      expected: {
        kind: "idle",
      },
    },
    {
      name: "hypothesis-bookkeeping-alone-stays-idle",
      baseDriveSignal: { kind: "idle" },
      signals: [
        {
          source: "active-learning",
          kind: "hypothesis_tested",
          severity: 1,
          summary: "jepa_correlation:0.40, events:8",
          hypothesisId: "hyp_1",
          confirmed: true,
        },
      ],
      expected: {
        kind: "idle",
      },
    },
    {
      name: "strong-correlation-wakes-idle-base",
      baseDriveSignal: { kind: "idle" },
      signals: [
        {
          source: "jepa-empirical",
          kind: "correlation",
          severity: 0.5,
          summary: "jepa_correlation=0.5 events=12",
          correlationScore: 0.5,
          totalEvents: 12,
        },
      ],
      expected: {
        kind: "entropy_alert",
        minUrgency: 0.6,
      },
    },
    {
      name: "reinforcing-thought-boosts-existing-curiosity",
      baseDriveSignal: {
        kind: "curiosity",
        target: "memory/2026-03-25.md",
        reason: "base_curiosity",
        urgency: 0.4,
      },
      signals: [
        {
          source: "continuous-thinking",
          kind: "thought",
          severity: 0.6,
          summary: "a memory gap should be explored",
          thoughtId: "thought_2",
          drive: "learning",
        },
      ],
      expected: {
        kind: "curiosity",
        minUrgency: 0.45,
      },
    },
  ];
}

function matchesExpectedDrive(
  actual: {
    signal: InnerDriveSignal;
    source?: "kernel" | "omega-wsp";
  },
  expected: ExpectedDrive,
): boolean {
  if (actual.signal.kind !== expected.kind) {
    return false;
  }
  if (expected.source && actual.source !== expected.source) {
    return false;
  }
  if (typeof expected.minUrgency === "number") {
    if (actual.signal.kind === "idle") {
      return false;
    }
    if (actual.signal.urgency < expected.minUrgency) {
      return false;
    }
  }
  return true;
}

function computeAuthorityModuleOutcome(scenario: AuthorityScenario): {
  signal: InnerDriveSignal;
  source?: "kernel" | "omega-wsp";
} {
  const snapshot = deriveOmegaPolicySnapshot({
    kernel: scenario.kernel,
    wsp: scenario.wsp,
    nowMs: 61_000,
    memoryCandidates: ["MEMORY.md"],
  });
  return {
    signal: snapshot.driveSignal,
    source: snapshot.driveSignalSource,
  };
}

function computeAuthorityBaselineOutcome(scenario: AuthorityScenario): {
  signal: InnerDriveSignal;
  source?: "kernel" | "omega-wsp";
} {
  if (!scenario.kernel) {
    return { signal: { kind: "idle" } };
  }
  if (scenario.wsp) {
    return {
      signal: evaluateInnerDrivesFromWSP({
        wsp: scenario.wsp,
        kernel: scenario.kernel,
        nowMs: 61_000,
        memoryCandidates: ["MEMORY.md"],
      }),
      source: "omega-wsp",
    };
  }
  return {
    signal: evaluateInnerDrives({
      kernel: scenario.kernel,
      nowMs: 61_000,
      memoryCandidates: ["MEMORY.md"],
    }),
    source: "kernel",
  };
}

function classifySignalAsDrive(signal: OmegaEngineSignal): InnerDriveSignal {
  switch (signal.kind) {
    case "contradiction":
      return {
        kind: "homeostasis",
        reason: `naive:${signal.source}:${signal.kind}`,
        urgency: Math.min(0.95, 0.3 + signal.severity * 0.6),
      };
    case "correlation":
      return {
        kind: "entropy_alert",
        silentMs: 0,
        reason: `naive:${signal.source}:${signal.kind}`,
        urgency: Math.min(0.95, 0.3 + signal.severity * 0.6),
      };
    case "thought":
    case "hypothesis_generated":
    case "hypothesis_tested":
      return {
        kind: "curiosity",
        target: "memory/",
        reason: `naive:${signal.source}:${signal.kind}`,
        urgency: Math.min(0.95, 0.3 + signal.severity * 0.6),
      };
  }
}

function computeSignalBaselineOutcome(scenario: SignalScenario): InnerDriveSignal {
  if (scenario.baseDriveSignal.kind !== "idle") {
    return scenario.baseDriveSignal;
  }
  if (scenario.signals.length === 0) {
    return { kind: "idle" };
  }
  const strongest = [...scenario.signals].sort((left, right) => right.severity - left.severity)[0];
  return classifySignalAsDrive(strongest);
}

function computeSignalModuleOutcome(scenario: SignalScenario): InnerDriveSignal {
  const engineScore = scoreOmegaEngineSignals(scenario.signals);
  return mergeOmegaDriveSignalWithEngineScore({
    baseDriveSignal: scenario.baseDriveSignal,
    engineScore,
  });
}

export function computeOmegaSignalAuthorityBenchmarkSummary(): OmegaSignalAuthorityBenchmarkSummary {
  const authorityScenarios = buildAuthorityScenarios();
  let authorityModuleHits = 0;
  let authorityBaselineHits = 0;

  for (const scenario of authorityScenarios) {
    if (matchesExpectedDrive(computeAuthorityModuleOutcome(scenario), scenario.expected)) {
      authorityModuleHits += 1;
    }
    if (matchesExpectedDrive(computeAuthorityBaselineOutcome(scenario), scenario.expected)) {
      authorityBaselineHits += 1;
    }
  }

  const signalScenarios = buildSignalScenarios();
  let signalModuleHits = 0;
  let signalBaselineHits = 0;

  for (const scenario of signalScenarios) {
    if (matchesExpectedDrive({ signal: computeSignalModuleOutcome(scenario) }, scenario.expected)) {
      signalModuleHits += 1;
    }
    if (
      matchesExpectedDrive({ signal: computeSignalBaselineOutcome(scenario) }, scenario.expected)
    ) {
      signalBaselineHits += 1;
    }
  }

  return {
    authority: {
      moduleHits: authorityModuleHits,
      baselineHits: authorityBaselineHits,
      total: authorityScenarios.length,
      netImprovement: authorityModuleHits - authorityBaselineHits,
    },
    signalScoring: {
      moduleHits: signalModuleHits,
      baselineHits: signalBaselineHits,
      total: signalScenarios.length,
      netImprovement: signalModuleHits - signalBaselineHits,
    },
    targetedImprovementValidated:
      authorityModuleHits > authorityBaselineHits && signalModuleHits > signalBaselineHits,
  };
}
