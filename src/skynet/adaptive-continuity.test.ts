import { describe, expect, it } from "vitest";
import {
  deriveAdaptiveContinuitySnapshot,
  deriveRuleContinuityScore,
} from "./adaptive-continuity.js";

describe("adaptive continuity", () => {
  it("smooths a transient disruptive cycle relative to the raw rule score", () => {
    const stable = deriveAdaptiveContinuitySnapshot({
      inputs: {
        focusStreak: 3,
        retainedRatio: 1,
        sameMode: true,
        modeShiftCount: 0,
      },
    });
    const transient = deriveAdaptiveContinuitySnapshot({
      inputs: {
        focusStreak: 1,
        retainedRatio: 0.45,
        sameMode: false,
        modeShiftCount: 1,
      },
      prior: stable,
    });

    expect(stable.adaptiveContinuityScore).toBeGreaterThan(0.8);
    expect(transient.ruleContinuityScore).toBeLessThan(0.55);
    expect(transient.adaptiveContinuityScore).toBeGreaterThan(transient.ruleContinuityScore);
  });

  it("matches the legacy rule when no prior state exists", () => {
    const rule = deriveRuleContinuityScore({
      focusStreak: 1,
      retainedRatio: 0.7,
      sameMode: true,
      modeShiftCount: 0,
    });
    const adaptive = deriveAdaptiveContinuitySnapshot({
      inputs: {
        focusStreak: 1,
        retainedRatio: 0.7,
        sameMode: true,
        modeShiftCount: 0,
      },
    });

    expect(adaptive.ruleContinuityScore).toBeCloseTo(rule, 6);
    expect(adaptive.adaptiveContinuityScore).toBeCloseTo(rule, 6);
  });
});
