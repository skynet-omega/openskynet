import { describe, expect, it } from "vitest";
import { withEnv } from "../test-utils/env.js";
import {
  isOmegaJepaControlEnabled,
  shouldApplyOmegaJepaControlSignal,
  shouldSurfaceOmegaJepaWarnings,
} from "./jepa-control.js";

describe("omega JEPA control gating", () => {
  it("keeps JEPA out of the control path by default", () => {
    expect(isOmegaJepaControlEnabled({})).toBe(false);
    expect(shouldApplyOmegaJepaControlSignal({ frustration: 1.8, confidence: 0.9 }, {})).toBe(
      false,
    );
  });

  it("allows JEPA control only when explicitly enabled and credible", () => {
    withEnv({ OPENSKYNET_OMEGA_JEPA_CONTROL: "1" }, () => {
      expect(isOmegaJepaControlEnabled()).toBe(true);
      expect(
        shouldApplyOmegaJepaControlSignal({
          frustration: 0.8,
          confidence: 0.7,
        }),
      ).toBe(true);
    });
  });

  it("rejects low-confidence or errored JEPA signals even when enabled", () => {
    withEnv({ OPENSKYNET_OMEGA_JEPA_CONTROL: "1" }, () => {
      expect(
        shouldApplyOmegaJepaControlSignal({
          frustration: 1.2,
          confidence: 0.1,
        }),
      ).toBe(false);
      expect(
        shouldApplyOmegaJepaControlSignal({
          frustration: 1.2,
          confidence: 0.9,
          error: "bridge failed",
        }),
      ).toBe(false);
    });
  });

  it("keeps JEPA bridge warnings quiet in observational mode", () => {
    expect(shouldSurfaceOmegaJepaWarnings({})).toBe(false);
    expect(shouldSurfaceOmegaJepaWarnings({ OPENSKYNET_OMEGA_JEPA_WARN: "1" })).toBe(true);
  });
});
