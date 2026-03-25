import { describe, expect, it } from "vitest";
import type { OmegaWorldStatePersistent } from "./omega-wsp.js";
import { deriveOmegaHeartbeatTurnPolicy, deriveOmegaPolicySnapshot } from "./policy-engine.js";
import type { OmegaSelfTimeKernelState } from "./self-time-kernel.js";

function makeKernel(overrides?: Partial<OmegaSelfTimeKernelState>): OmegaSelfTimeKernelState {
  return {
    revision: 2,
    sessionKey: "main",
    turnCount: 8,
    activeGoalId: undefined,
    identity: {
      continuityId: "cid",
      firstSeenAt: 1,
      lastSeenAt: 1,
      lastTask: "review memory",
      lastInteractionKind: "direct_instruction",
    },
    world: {
      lastOutcomeStatus: "ok",
      lastObservedChangedFiles: [],
    },
    goals: [],
    tension: {
      openGoalCount: 0,
      staleGoalCount: 0,
      failureStreak: 0,
      repeatedFailureKinds: [],
      pendingCorrection: false,
    },
    causalGraph: {
      files: [],
      edges: [],
    },
    updatedAt: 1,
    ...overrides,
  };
}

function makeWsp(overrides?: Partial<OmegaWorldStatePersistent>): OmegaWorldStatePersistent {
  return {
    version: 1,
    sessionKey: "main",
    createdAt: 1,
    updatedAt: 2,
    updateCount: 1,
    beliefs: [],
    drives: [
      {
        name: "curiosity",
        setpoint: 0.6,
        currentLevel: 0.1,
        error: 0.5,
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

describe("omega policy engine", () => {
  it("returns idle policy when there is no kernel", () => {
    const snapshot = deriveOmegaPolicySnapshot({});

    expect(snapshot.wakeAction.kind).toBe("heartbeat_ok");
    expect(snapshot.driveSignal.kind).toBe("idle");
    expect(snapshot.shouldRunAutonomy).toBe(false);
  });

  it("surfaces an autonomous drive without inventing a new wake policy", () => {
    const snapshot = deriveOmegaPolicySnapshot({
      kernel: makeKernel(),
      nowMs: 61_000,
      memoryCandidates: ["MEMORY.md"],
    });

    expect(snapshot.wakeAction.kind).toBe("heartbeat_ok");
    expect(snapshot.driveSignal.kind).toBe("entropy_alert");
    expect(snapshot.driveSignalSource).toBe("kernel");
    expect(snapshot.shouldRunAutonomy).toBe(true);
  });

  it("prefers WSP drive authority when persistent drive state is calibrated", () => {
    const snapshot = deriveOmegaPolicySnapshot({
      kernel: makeKernel(),
      wsp: makeWsp(),
      nowMs: 61_000,
      memoryCandidates: ["MEMORY.md"],
    });

    expect(snapshot.wakeAction.kind).toBe("heartbeat_ok");
    expect(snapshot.driveSignal.kind).toBe("curiosity");
    expect(snapshot.driveSignalSource).toBe("omega-wsp");
    expect(snapshot.shouldRunAutonomy).toBe(true);
  });

  it("keeps the kernel fallback when WSP exists but is not calibrated", () => {
    const snapshot = deriveOmegaPolicySnapshot({
      kernel: makeKernel(),
      wsp: makeWsp({
        updateCount: 0,
        drives: makeWsp().drives.map((drive) => ({
          ...drive,
          currentLevel: drive.setpoint,
          error: 0,
        })),
      }),
      nowMs: 61_000,
      memoryCandidates: ["MEMORY.md"],
    });

    expect(snapshot.driveSignal.kind).toBe("entropy_alert");
    expect(snapshot.driveSignalSource).toBe("kernel");
  });

  it("prefers fast continuation when a heartbeat turn is progressing", () => {
    const policy = deriveOmegaHeartbeatTurnPolicy({
      terminationReason: "continue",
      progressObserved: true,
    });

    expect(policy).toMatchObject({
      continueDelayMs: 1_000,
      shouldBackoff: false,
      turnHealth: "progressing",
    });
  });

  it("backs off when a heartbeat turn continues without progress", () => {
    const policy = deriveOmegaHeartbeatTurnPolicy({
      terminationReason: "continue",
      progressObserved: false,
    });

    expect(policy).toMatchObject({
      continueDelayMs: 7_500,
      shouldBackoff: true,
      turnHealth: "stalled",
    });
  });
});
