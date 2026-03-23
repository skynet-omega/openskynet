import { describe, expect, it } from "vitest";
import { withEnv } from "../test-utils/env.js";
import {
  isOmegaExperimentalBootstrapEnabled,
  shouldOmegaSeedDaemonSession,
  shouldRunOmegaHomeostasisDaemon,
} from "./experimental-runtime.js";

describe("omega experimental runtime flags", () => {
  it("keeps daemon bootstrap experimental stack disabled by default", () => {
    expect(isOmegaExperimentalBootstrapEnabled({})).toBe(false);
  });

  it("keeps daemon session seeding disabled by default", () => {
    expect(shouldOmegaSeedDaemonSession({})).toBe(false);
  });

  it("keeps homeostasis daemon disabled by default", () => {
    expect(shouldRunOmegaHomeostasisDaemon({})).toBe(false);
  });

  it("allows explicit opt-in for experimental daemon bootstrap and seeding", () => {
    withEnv(
      {
        OPENSKYNET_OMEGA_EXPERIMENTAL_BOOTSTRAP: "1",
        OPENSKYNET_OMEGA_SEED_SESSION: "1",
        OPENSKYNET_OMEGA_HOMEOSTASIS_DAEMON: "1",
      },
      () => {
        expect(isOmegaExperimentalBootstrapEnabled()).toBe(true);
        expect(shouldOmegaSeedDaemonSession()).toBe(true);
        expect(shouldRunOmegaHomeostasisDaemon()).toBe(true);
      },
    );
  });
});
