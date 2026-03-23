import { describe, expect, it } from "vitest";
import { withEnv } from "../test-utils/env.js";
import { isOmegaSpeculativeIdleEnabled } from "./idle-mode.js";

describe("omega speculative idle mode", () => {
  it("keeps speculative idle cognition disabled by default", () => {
    expect(isOmegaSpeculativeIdleEnabled({})).toBe(false);
  });

  it("allows speculative idle cognition only when explicitly enabled", () => {
    withEnv({ OPENSKYNET_OMEGA_SPECULATIVE_IDLE: "1" }, () => {
      expect(isOmegaSpeculativeIdleEnabled()).toBe(true);
    });
  });
});
