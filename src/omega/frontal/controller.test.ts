import { describe, expect, it } from "vitest";
import type { OmegaSelfTimeKernelState } from "../self-time-kernel.js";
import type {
  OmegaSessionTimelineEntry,
  OmegaSessionValidationSnapshot,
} from "../session-context.js";
import { decideOmegaFrontalAction } from "./controller.js";

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
    turnCount: 3,
    identity: {
      continuityId: "cont-1",
      firstSeenAt: 1,
      lastSeenAt: 3,
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
    updatedAt: 3,
    ...overrides,
  };
}

describe("decideOmegaFrontalAction", () => {
  it("reuses a verified cached reply when the target has not changed", () => {
    const validation = makeValidation({ expectsJson: true, expectedKeys: ["status"] });
    const timeline = [
      makeTimelineEntry("verify the module", 1, {
        validation,
        reply: '{"status":"ok"}',
      }),
    ];

    const decision = decideOmegaFrontalAction({
      task: "verify the module",
      validation,
      timeline,
      kernel: makeKernel(),
    });

    expect(decision.kind).toBe("reuse_verified_result");
  });

  it("does not reuse a cached reply after the tracked target changed", () => {
    const validation = makeValidation({ expectedPaths: ["src/app.ts"] });
    const timeline = [
      makeTimelineEntry("inspect src/app.ts", 1, {
        validation,
        reply: "looks good",
      }),
    ];

    const decision = decideOmegaFrontalAction({
      task: "inspect src/app.ts",
      validation,
      timeline,
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
    });

    expect(decision.kind).toBe("none");
  });

  it("escalates repeated verified write failures on corrective feedback", () => {
    const validation = makeValidation({ expectedPaths: ["src/app.ts"] });
    const timeline = [
      makeTimelineEntry("fix src/app.ts", 1, {
        validation,
        outcome: { status: "error", errorKind: "target_not_touched" },
      }),
      makeTimelineEntry("fix src/app.ts again", 2, {
        validation,
        outcome: { status: "error", errorKind: "missing_target_writes" },
      }),
    ];

    const decision = decideOmegaFrontalAction({
      task: "fix src/app.ts again, it still failed",
      validation,
      timeline,
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
    });

    expect(decision.kind).toBe("escalate_isolated_repair");
  });
});
