import { describe, expect, it } from "vitest";
import {
  OMEGA_DEFAULT_AUTONOMOUS_INTERVAL_MINUTES,
  OMEGA_DEFAULT_SESSION_KEY,
  resolveOmegaAutonomousIntervalMinutes,
  resolveOmegaRuntimeDefaults,
  resolveOmegaSessionKey,
  resolveOmegaWorkspaceRoot,
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

  it("resolves workspace, session, and interval from the shared runtime authority", () => {
    expect(
      resolveOmegaWorkspaceRoot({
        env: {},
        cwd: "/tmp/workspace",
      }),
    ).toBe("/tmp/workspace");

    expect(
      resolveOmegaSessionKey({
        env: {},
      }),
    ).toBe(OMEGA_DEFAULT_SESSION_KEY);

    expect(
      resolveOmegaRuntimeDefaults({
        env: {
          WORKSPACE_ROOT: "/tmp/env-workspace",
          SESSION_KEY: "agent:custom",
          OPENSKYNET_INTERVAL_MINUTES: "7",
        } as NodeJS.ProcessEnv,
      }),
    ).toEqual({
      workspaceRoot: "/tmp/env-workspace",
      sessionKey: "agent:custom",
      intervalMinutes: 7,
    });
  });
});
