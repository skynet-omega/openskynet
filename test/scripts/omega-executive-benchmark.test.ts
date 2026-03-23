import { describe, expect, it } from "vitest";
import { computeOmegaExecutiveBenchmarkSummary } from "../../scripts/lib/omega-executive-benchmark.js";

describe("omega executive benchmark summary", () => {
  it("beats the naive baseline on targeted arbitration scenarios", () => {
    const summary = computeOmegaExecutiveBenchmarkSummary();
    expect(summary.moduleHits).toBeGreaterThan(summary.baselineHits);
    expect(summary.targetedImprovementValidated).toBe(true);
  });
});
