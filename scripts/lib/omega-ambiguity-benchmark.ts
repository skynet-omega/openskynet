import { decideOmegaFrontalAction } from "../../src/omega/frontal/controller.js";
import { RicciGraphAnalytics } from "../../src/omega/graph-analytics.js";
import type { OmegaSelfTimeKernelState } from "../../src/omega/self-time-kernel.js";
import type {
  OmegaSessionTimelineEntry,
  OmegaSessionValidationSnapshot,
} from "../../src/omega/session-context.js";

type ControllerExpectedAction = "none" | "reuse_verified_result" | "escalate_isolated_repair";

type ControllerScenario = {
  name: string;
  task: string;
  validation: OmegaSessionValidationSnapshot;
  timeline: OmegaSessionTimelineEntry[];
  kernel: OmegaSelfTimeKernelState;
  expected: ControllerExpectedAction;
};

type GraphScenario = {
  name: string;
  kernel: OmegaSelfTimeKernelState;
  expectedTopPath: string | null;
};

export type OmegaAmbiguityBenchmarkSummary = {
  controller: {
    moduleHits: number;
    baselineHits: number;
    total: number;
    netImprovement: number;
  };
  graphFocus: {
    moduleHits: number;
    baselineHits: number;
    total: number;
    netImprovement: number;
  };
  targetedImprovementValidated: boolean;
};

function makeValidation(
  overrides: Partial<OmegaSessionValidationSnapshot> = {},
): OmegaSessionValidationSnapshot {
  return {
    expectsJson: false,
    expectedKeys: [],
    expectedPaths: [],
    ...overrides,
  };
}

function makeTimelineEntry(
  task: string,
  createdAt: number,
  overrides: Partial<OmegaSessionTimelineEntry> = {},
): OmegaSessionTimelineEntry {
  return {
    createdAt,
    task,
    validation: makeValidation(),
    outcome: { status: "ok" },
    ...overrides,
  };
}

function makeKernel(overrides: Partial<OmegaSelfTimeKernelState> = {}): OmegaSelfTimeKernelState {
  return {
    revision: 2,
    sessionKey: "agent:test:main",
    turnCount: 4,
    identity: {
      continuityId: "cont-1",
      firstSeenAt: 1,
      lastSeenAt: 4,
    },
    world: {
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
    updatedAt: 4,
    ...overrides,
  };
}

function buildControllerScenarios(): ControllerScenario[] {
  const verificationValidation = makeValidation({ expectsJson: true, expectedKeys: ["status"] });
  const targetedValidation = makeValidation({ expectedPaths: ["src/app.ts"] });

  return [
    {
      name: "cache-hit-verification",
      task: "verify the module",
      validation: verificationValidation,
      timeline: [
        makeTimelineEntry("verify the module", 1, {
          validation: verificationValidation,
          reply: '{"status":"ok"}',
        }),
      ],
      kernel: makeKernel(),
      expected: "reuse_verified_result",
    },
    {
      name: "cache-invalidated-after-write",
      task: "inspect src/app.ts",
      validation: targetedValidation,
      timeline: [
        makeTimelineEntry("inspect src/app.ts", 1, {
          validation: targetedValidation,
          reply: "looks good",
        }),
      ],
      kernel: makeKernel({
        causalGraph: {
          files: [
            {
              path: "src/app.ts",
              lastWriteAt: 10,
              lastWriteTurn: 2,
              writeCount: 1,
              failureCount: 0,
            },
          ],
          edges: [],
        },
      }),
      expected: "none",
    },
    {
      name: "repeated-write-failure-escalation",
      task: "fix src/app.ts again, it still failed",
      validation: targetedValidation,
      timeline: [
        makeTimelineEntry("fix src/app.ts", 1, {
          validation: targetedValidation,
          outcome: { status: "error", errorKind: "target_not_touched" },
        }),
        makeTimelineEntry("fix src/app.ts again", 2, {
          validation: targetedValidation,
          outcome: { status: "error", errorKind: "missing_target_writes" },
        }),
      ],
      kernel: makeKernel({
        tension: {
          openGoalCount: 1,
          staleGoalCount: 0,
          failureStreak: 2,
          repeatedFailureKinds: ["target_not_touched", "missing_target_writes"],
          pendingCorrection: true,
        },
        causalGraph: {
          files: [
            {
              path: "src/app.ts",
              lastFailureKind: "missing_target_writes",
              lastFailureTurn: 2,
              lastWriteTurn: 0,
              writeCount: 0,
              failureCount: 2,
            },
          ],
          edges: [],
        },
      }),
      expected: "escalate_isolated_repair",
    },
    {
      name: "direct-instruction-no-special-handling",
      task: "implement the feature in src/app.ts",
      validation: targetedValidation,
      timeline: [],
      kernel: makeKernel(),
      expected: "none",
    },
  ];
}

function extractFocusPath(recommendation: string | null): string | null {
  if (!recommendation) {
    return null;
  }
  const match = recommendation.match(/'([^']+)'/);
  return match?.[1] ?? null;
}

function baselineFocusPath(kernel: OmegaSelfTimeKernelState): string | null {
  const ranked = [...kernel.causalGraph.files]
    .sort((left, right) => {
      if (right.failureCount !== left.failureCount) {
        return right.failureCount - left.failureCount;
      }
      return left.path.localeCompare(right.path);
    })
    .find((file) => file.failureCount > 0);
  return ranked?.path ?? null;
}

function buildGraphScenarios(): GraphScenario[] {
  return [
    {
      name: "prefer-low-success-bottleneck-over-busy-file",
      kernel: makeKernel({
        causalGraph: {
          files: [
            { path: "src/busy.ts", writeCount: 6, failureCount: 2 },
            { path: "src/bottleneck.ts", writeCount: 0, failureCount: 1 },
          ],
          edges: [
            {
              goalId: "g1",
              filePath: "src/busy.ts",
              relation: "goal_targets_file",
              updatedAt: 1,
              updatedTurn: 1,
            },
            {
              goalId: "g2",
              filePath: "src/busy.ts",
              relation: "goal_failed_on_file",
              updatedAt: 2,
              updatedTurn: 2,
            },
            {
              goalId: "g3",
              filePath: "src/bottleneck.ts",
              relation: "goal_failed_on_file",
              updatedAt: 3,
              updatedTurn: 3,
            },
          ],
        },
      }),
      expectedTopPath: "src/bottleneck.ts",
    },
    {
      name: "obvious-most-failing-file-stays-top",
      kernel: makeKernel({
        causalGraph: {
          files: [
            { path: "src/critical.ts", writeCount: 0, failureCount: 3 },
            { path: "src/helper.ts", writeCount: 3, failureCount: 0 },
          ],
          edges: [
            {
              goalId: "g1",
              filePath: "src/critical.ts",
              relation: "goal_failed_on_file",
              updatedAt: 1,
              updatedTurn: 1,
            },
          ],
        },
      }),
      expectedTopPath: "src/critical.ts",
    },
    {
      name: "no-bottleneck-when-files-are-stable",
      kernel: makeKernel({
        causalGraph: {
          files: [
            { path: "src/stable.ts", writeCount: 4, failureCount: 0 },
            { path: "src/healthy.ts", writeCount: 2, failureCount: 0 },
          ],
          edges: [
            {
              goalId: "g1",
              filePath: "src/stable.ts",
              relation: "goal_wrote_file",
              updatedAt: 1,
              updatedTurn: 1,
            },
          ],
        },
      }),
      expectedTopPath: null,
    },
  ];
}

function scoreControllerScenario(scenario: ControllerScenario): {
  moduleHit: boolean;
  baselineHit: boolean;
} {
  const moduleDecision = decideOmegaFrontalAction({
    task: scenario.task,
    validation: scenario.validation,
    timeline: scenario.timeline,
    kernel: scenario.kernel,
  });

  return {
    moduleHit: moduleDecision.kind === scenario.expected,
    baselineHit: scenario.expected === "none",
  };
}

function scoreGraphScenario(scenario: GraphScenario): { moduleHit: boolean; baselineHit: boolean } {
  const modulePath = extractFocusPath(RicciGraphAnalytics.getFocusRecommendation(scenario.kernel));
  const baselinePath = baselineFocusPath(scenario.kernel);
  return {
    moduleHit: modulePath === scenario.expectedTopPath,
    baselineHit: baselinePath === scenario.expectedTopPath,
  };
}

export function computeOmegaAmbiguityBenchmarkSummary(): OmegaAmbiguityBenchmarkSummary {
  const controllerScenarios = buildControllerScenarios();
  const graphScenarios = buildGraphScenarios();

  const controllerScores = controllerScenarios.map(scoreControllerScenario);
  const graphScores = graphScenarios.map(scoreGraphScenario);

  const controllerModuleHits = controllerScores.filter((score) => score.moduleHit).length;
  const controllerBaselineHits = controllerScores.filter((score) => score.baselineHit).length;
  const graphModuleHits = graphScores.filter((score) => score.moduleHit).length;
  const graphBaselineHits = graphScores.filter((score) => score.baselineHit).length;

  return {
    controller: {
      moduleHits: controllerModuleHits,
      baselineHits: controllerBaselineHits,
      total: controllerScenarios.length,
      netImprovement: controllerModuleHits - controllerBaselineHits,
    },
    graphFocus: {
      moduleHits: graphModuleHits,
      baselineHits: graphBaselineHits,
      total: graphScenarios.length,
      netImprovement: graphModuleHits - graphBaselineHits,
    },
    targetedImprovementValidated:
      controllerModuleHits > controllerBaselineHits && graphModuleHits > graphBaselineHits,
  };
}
