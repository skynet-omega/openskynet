import { describe, expect, it } from "vitest";
import { RicciGraphAnalytics } from "./graph-analytics.js";
import type { OmegaSelfTimeKernelState } from "./self-time-kernel.js";

function makeKernel(
  files: OmegaSelfTimeKernelState["causalGraph"]["files"],
  edges: OmegaSelfTimeKernelState["causalGraph"]["edges"],
): OmegaSelfTimeKernelState {
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
      files,
      edges,
    },
    updatedAt: 4,
  };
}

describe("RicciGraphAnalytics", () => {
  it("prioritizes low-success bottlenecks over busy but mostly successful files", () => {
    const kernel = makeKernel(
      [
        { path: "src/busy.ts", writeCount: 6, failureCount: 2 },
        { path: "src/bottleneck.ts", writeCount: 0, failureCount: 1 },
      ],
      [
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
    );

    const recommendation = RicciGraphAnalytics.getFocusRecommendation(kernel);

    expect(recommendation).toContain("src/bottleneck.ts");
  });

  it("returns null when no file crosses the bottleneck threshold", () => {
    const kernel = makeKernel(
      [
        { path: "src/stable.ts", writeCount: 4, failureCount: 0 },
        { path: "src/healthy.ts", writeCount: 3, failureCount: 0 },
      ],
      [
        {
          goalId: "g1",
          filePath: "src/stable.ts",
          relation: "goal_wrote_file",
          updatedAt: 1,
          updatedTurn: 1,
        },
      ],
    );

    const recommendation = RicciGraphAnalytics.getFocusRecommendation(kernel);

    expect(recommendation).toBeNull();
  });

  it("sorts the most negative-curvature file first", () => {
    const kernel = makeKernel(
      [
        { path: "src/stable.ts", writeCount: 3, failureCount: 0 },
        { path: "src/failing.ts", writeCount: 0, failureCount: 1 },
      ],
      [
        {
          goalId: "g1",
          filePath: "src/failing.ts",
          relation: "goal_failed_on_file",
          updatedAt: 1,
          updatedTurn: 1,
        },
      ],
    );

    const analysis = RicciGraphAnalytics.analyze(kernel);

    expect(analysis[0]?.path).toBe("src/failing.ts");
    expect((analysis[0]?.curvature ?? 0) < (analysis[1]?.curvature ?? 0)).toBe(true);
  });
});
