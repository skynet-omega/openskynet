import { describe, expect, it } from "vitest";
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
    expect(snapshot.shouldRunAutonomy).toBe(true);
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
