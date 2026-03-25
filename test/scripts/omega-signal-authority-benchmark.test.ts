import { describe, expect, it } from "vitest";
import { computeOmegaSignalAuthorityBenchmarkSummary } from "../../scripts/lib/omega-signal-authority-benchmark.js";

describe("omega signal and authority benchmark summary", () => {
  it("beats naive baselines for authority gating and engine scoring", () => {
    const summary = computeOmegaSignalAuthorityBenchmarkSummary();

    expect(summary.authority.total).toBeGreaterThan(0);
    expect(summary.signalScoring.total).toBeGreaterThan(0);
    expect(summary.authority.moduleHits).toBeGreaterThan(summary.authority.baselineHits);
    expect(summary.signalScoring.moduleHits).toBeGreaterThan(summary.signalScoring.baselineHits);
    expect(summary.targetedImprovementValidated).toBe(true);
  });
});
