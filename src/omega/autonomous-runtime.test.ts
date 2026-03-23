import { describe, expect, it } from "vitest";
import {
  OMEGA_DEFAULT_AUTONOMOUS_INTERVAL_MINUTES,
  resolveOmegaAutonomousIntervalMinutes,
} from "./autonomous-runtime.js";

describe("omega autonomous runtime defaults", () => {
  it("uses a single default autonomous interval", () => {
    expect(OMEGA_DEFAULT_AUTONOMOUS_INTERVAL_MINUTES).toBe(5);
  });

  it("parses valid intervals and falls back on invalid input", () => {
    expect(resolveOmegaAutonomousIntervalMinutes("10")).toBe(10);
    expect(resolveOmegaAutonomousIntervalMinutes(20)).toBe(20);
    expect(resolveOmegaAutonomousIntervalMinutes("0")).toBe(
      OMEGA_DEFAULT_AUTONOMOUS_INTERVAL_MINUTES,
    );
    expect(resolveOmegaAutonomousIntervalMinutes("-1")).toBe(
      OMEGA_DEFAULT_AUTONOMOUS_INTERVAL_MINUTES,
    );
    expect(resolveOmegaAutonomousIntervalMinutes("not-a-number")).toBe(
      OMEGA_DEFAULT_AUTONOMOUS_INTERVAL_MINUTES,
    );
    expect(resolveOmegaAutonomousIntervalMinutes(undefined)).toBe(
      OMEGA_DEFAULT_AUTONOMOUS_INTERVAL_MINUTES,
    );
  });
});
