import { describe, expect, it } from "vitest";
import {
  deriveOmegaLocalEditContract,
  summarizeOmegaLocalEditTelemetry,
} from "./local-edit-contract.js";

describe("omega local edit contract", () => {
  it("splits target and protected paths from the validated scope", () => {
    const contract = deriveOmegaLocalEditContract({
      expectedPaths: ["src/target.ts"],
      watchedPaths: ["src/target.ts", "src/protected.ts"],
    });

    expect(contract).toEqual({
      targetPaths: ["src/target.ts"],
      protectedPaths: ["src/protected.ts"],
      totalScopePaths: ["src/target.ts", "src/protected.ts"],
    });
  });

  it("computes locality and protected preservation telemetry", () => {
    const telemetry = summarizeOmegaLocalEditTelemetry({
      contract: deriveOmegaLocalEditContract({
        expectedPaths: ["src/target.ts"],
        watchedPaths: ["src/target.ts", "src/protected.ts"],
      }),
      matchedExpectedPaths: ["src/target.ts"],
      missingExpectedPaths: [],
      collateralObservedPaths: ["src/protected.ts"],
    });

    expect(telemetry.localityScore).toBe(0);
    expect(telemetry.protectedPreservationRate).toBe(0);
    expect(telemetry.collateralObservedPaths).toEqual(["src/protected.ts"]);
  });
});
