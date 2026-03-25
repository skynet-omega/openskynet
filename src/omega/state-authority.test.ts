import { describe, expect, it } from "vitest";
import type { OmegaWorldStatePersistent } from "./omega-wsp.js";
import {
  deriveOmegaStateAuthoritySnapshot,
  hasActiveOmegaWspDriveAuthority,
} from "./state-authority.js";

function makeWsp(overrides?: Partial<OmegaWorldStatePersistent>): OmegaWorldStatePersistent {
  return {
    version: 1,
    sessionKey: "main",
    createdAt: 1,
    updatedAt: 2,
    updateCount: 0,
    beliefs: [],
    drives: [
      {
        name: "curiosity",
        setpoint: 0.6,
        currentLevel: 0.6,
        error: 0,
        decayRate: 0.02,
        lastSatisfiedAt: 1,
      },
      {
        name: "integrity",
        setpoint: 0.8,
        currentLevel: 0.8,
        error: 0,
        decayRate: 0.005,
        lastSatisfiedAt: 1,
      },
      {
        name: "competence",
        setpoint: 0.7,
        currentLevel: 0.7,
        error: 0,
        decayRate: 0.01,
        lastSatisfiedAt: 1,
      },
      {
        name: "homeostasis",
        setpoint: 0.9,
        currentLevel: 0.9,
        error: 0,
        decayRate: 0.03,
        lastSatisfiedAt: 1,
      },
    ],
    tensions: [],
    causalEdges: [],
    ...overrides,
  };
}

describe("omega state authority", () => {
  it("does not treat a fresh WSP as active drive authority", () => {
    const wsp = makeWsp();

    expect(hasActiveOmegaWspDriveAuthority(wsp)).toBe(false);

    const snapshot = deriveOmegaStateAuthoritySnapshot({ wsp });
    expect(snapshot.drives).toMatchObject({
      source: "kernel-fallback",
      status: "experimental",
    });
  });

  it("promotes WSP to authoritative drive state after calibration", () => {
    const wsp = makeWsp({
      updateCount: 3,
      drives: makeWsp().drives.map((drive, index) =>
        index === 0 ? { ...drive, currentLevel: 0.2, error: 0.4 } : drive,
      ),
    });

    expect(hasActiveOmegaWspDriveAuthority(wsp)).toBe(true);

    const snapshot = deriveOmegaStateAuthoritySnapshot({ wsp });
    expect(snapshot.drives).toMatchObject({
      source: "omega-wsp",
      status: "authoritative",
    });
  });
});
