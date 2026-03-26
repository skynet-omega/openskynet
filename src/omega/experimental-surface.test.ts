import { describe, expect, it } from "vitest";
import * as omegaExperimental from "./experimental.js";
import * as omega from "./index.js";

describe("omega public surface", () => {
  it("keeps experimental autonomy helpers out of the main omega barrel", () => {
    expect("runAutonomousCycle" in omega).toBe(false);
    expect("executeAutonomousAction" in omega).toBe(false);
    expect("runHomeostasisDaemon" in omega).toBe(false);
    expect("processIntegratedBrain" in omega).toBe(false);
    expect("formatInternalReflection" in omega).toBe(false);
  });

  it("keeps quarantined autonomy helpers out of the experimental barrel", () => {
    expect("runAutonomousCycle" in omegaExperimental).toBe(false);
    expect("executeAutonomousAction" in omegaExperimental).toBe(false);
  });

  it("exposes only the still-supported experimental runtime hooks", () => {
    expect("runHomeostasisDaemon" in omegaExperimental).toBe(true);
    expect("processIntegratedBrain" in omegaExperimental).toBe(true);
    expect("formatInternalReflection" in omegaExperimental).toBe(true);
  });
});
