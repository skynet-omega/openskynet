import { describe, expect, it } from "vitest";
import { computeOmegaAmbiguityBenchmarkSummary } from "../../scripts/lib/omega-ambiguity-benchmark.js";

describe("omega ambiguity benchmark summary", () => {
  it("shows net improvement over simple baselines for controller and graph focus", () => {
    const summary = computeOmegaAmbiguityBenchmarkSummary();

    expect(summary.controller.total).toBeGreaterThan(0);
    expect(summary.graphFocus.total).toBeGreaterThan(0);
    expect(summary.controller.moduleHits).toBeGreaterThan(summary.controller.baselineHits);
    expect(summary.graphFocus.moduleHits).toBeGreaterThan(summary.graphFocus.baselineHits);
    expect(summary.targetedImprovementValidated).toBe(true);
  });
});
