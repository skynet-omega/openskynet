import { describe, it, expect } from "vitest";
import {
  deriveSkynetWorldTransitionFeatures,
  type SkynetWorldTransitionObservation,
} from "./world-transition.js";

describe("Causal Valence Feature Engineering: Collateral Damage", () => {
  it("detects high collateral damage when many non-target files are modified", () => {
    const observation: SkynetWorldTransitionObservation = {
      targetPaths: ["src/skynet/nucleus.ts"],
      operations: [
        { path: "src/skynet/nucleus.ts", kind: "edit", isTarget: true },
        { path: "package.json", kind: "edit" },
        { path: "tsconfig.json", kind: "edit" },
        { path: "src/index.ts", kind: "edit" },
      ],
    };

    const features = deriveSkynetWorldTransitionFeatures(observation);

    // 1 target, 4 total operations. 3 are collateral.
    // collateralRatio = (4 - 1) / 4 = 0.75
    expect(features.collateralRatio).toBe(0.75);
    expect(features.targetCoverage).toBe(1);
  });

  it("detects clean progress when only target files are modified", () => {
    const observation: SkynetWorldTransitionObservation = {
      targetPaths: ["src/skynet/nucleus.ts"],
      operations: [{ path: "src/skynet/nucleus.ts", kind: "edit", isTarget: true }],
    };

    const features = deriveSkynetWorldTransitionFeatures(observation);

    expect(features.collateralRatio).toBe(0);
    expect(features.targetCoverage).toBe(1);
  });

  it("detects stall when no target files are modified but work is done", () => {
    const observation: SkynetWorldTransitionObservation = {
      targetPaths: ["src/skynet/nucleus.ts"],
      operations: [{ path: "README.md", kind: "edit" }],
    };

    const features = deriveSkynetWorldTransitionFeatures(observation);

    expect(features.collateralRatio).toBe(1);
    expect(features.targetCoverage).toBe(0);
  });
});
