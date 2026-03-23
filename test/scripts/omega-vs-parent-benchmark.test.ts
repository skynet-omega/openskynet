import { describe, expect, it } from "vitest";
import {
  computeOmegaVsParentBenchmarkSummary,
  parseVitestSummary,
} from "../../scripts/lib/omega-vs-parent-benchmark.js";

describe("omega vs parent benchmark summary", () => {
  it("parses vitest summaries with skipped tests", () => {
    const parsed = parseVitestSummary(`
 Test Files  4 passed (4)
      Tests  28 passed | 1 skipped (29)
   Duration  10.08s
`);

    expect(parsed).toEqual({
      testFilesPassed: 4,
      testFilesTotal: 4,
      testsPassed: 28,
      testsTotal: 29,
    });
  });

  it("marks targeted superiority valid only when build and both slices are fully green", () => {
    const summary = computeOmegaVsParentBenchmarkSummary({
      buildOk: true,
      omegaSlice: {
        testFilesPassed: 6,
        testFilesTotal: 6,
        testsPassed: 21,
        testsTotal: 21,
      },
      comparativeSlice: {
        testFilesPassed: 4,
        testFilesTotal: 4,
        testsPassed: 28,
        testsTotal: 28,
      },
    });

    expect(summary.targetedSuperiorityValidated).toBe(true);
  });

  it("fails the verdict when one slice is incomplete", () => {
    const summary = computeOmegaVsParentBenchmarkSummary({
      buildOk: true,
      omegaSlice: {
        testFilesPassed: 6,
        testFilesTotal: 6,
        testsPassed: 20,
        testsTotal: 21,
      },
      comparativeSlice: {
        testFilesPassed: 4,
        testFilesTotal: 4,
        testsPassed: 28,
        testsTotal: 28,
      },
    });

    expect(summary.targetedSuperiorityValidated).toBe(false);
  });
});
