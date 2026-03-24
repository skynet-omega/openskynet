import { decideOmegaWakeAction, type OmegaWakeAction } from "./frontal/wake-policy.js";
import { evaluateInnerDrives, type InnerDriveSignal } from "./inner-life/index.js";
import type { OmegaOperationalMemorySummary } from "./operational-memory.js";
import type { OmegaSelfTimeKernelState } from "./self-time-kernel.js";

const OMEGA_HEARTBEAT_CONTINUE_DELAY_MS = 5_000;
const OMEGA_HEARTBEAT_CONTINUE_DELAY_FAST_MS = 1_000;
const OMEGA_HEARTBEAT_CONTINUE_DELAY_BACKOFF_MS = 7_500;

export type OmegaPolicySnapshot = {
  wakeAction: OmegaWakeAction;
  driveSignal: InnerDriveSignal;
  shouldRunAutonomy: boolean;
  needsRecoveryAttention: boolean;
  // Note: integratedState removed — experimental module does not exist yet
};

export type OmegaHeartbeatTurnPolicy = {
  continueDelayMs: number;
  shouldBackoff: boolean;
  turnHealth: "progressing" | "stalled" | "resolved";
  vetoProb?: number;
  operationalSummary?: OmegaOperationalMemorySummary;
};

export function deriveOmegaPolicySnapshot(params: {
  kernel?: OmegaSelfTimeKernelState;
  nowMs?: number;
  memoryCandidates?: string[];
  operationalSummary?: OmegaOperationalMemorySummary;
  viabilityProb?: number;
  hasUrgentMaintenance?: boolean;
}): OmegaPolicySnapshot {
  // decideOmegaWakeAction only accepts { kernel? } — extra params are ignored here
  // operationalSummary / viabilityProb / hasUrgentMaintenance are available
  // for future extension of wake-policy.ts without breaking the build now.
  const wakeAction = decideOmegaWakeAction({
    kernel: params.kernel,
  });
  const driveSignal = params.kernel
    ? evaluateInnerDrives({
        kernel: params.kernel,
        nowMs: params.nowMs,
        memoryCandidates: params.memoryCandidates,
      })
    : { kind: "idle" as const };

  return {
    wakeAction,
    driveSignal,
    shouldRunAutonomy: driveSignal.kind !== "idle",
    needsRecoveryAttention:
      wakeAction.kind === "review_active_goal" ||
      wakeAction.kind === "resume_interrupted_goal" ||
      wakeAction.kind === "abort_interrupted_goal",
  };
}

export function deriveOmegaHeartbeatTurnPolicy(params: {
  terminationReason: "continue" | "structured_idle" | "reply_heartbeat_ok" | "error";
  progressObserved: boolean;
  vetoProb?: number;
  operationalSummary?: OmegaOperationalMemorySummary;
}): OmegaHeartbeatTurnPolicy {
  if (params.terminationReason !== "continue") {
    return {
      continueDelayMs: 0,
      shouldBackoff: false,
      turnHealth: "resolved",
      vetoProb: params.vetoProb,
      operationalSummary: params.operationalSummary,
    };
  }

  const isCausalStall = typeof params.vetoProb === "number" && params.vetoProb < 0.5;

  if (params.progressObserved && !isCausalStall) {
    return {
      continueDelayMs: OMEGA_HEARTBEAT_CONTINUE_DELAY_FAST_MS,
      shouldBackoff: false,
      turnHealth: "progressing",
      vetoProb: params.vetoProb,
      operationalSummary: params.operationalSummary,
    };
  }

  return {
    continueDelayMs: OMEGA_HEARTBEAT_CONTINUE_DELAY_BACKOFF_MS,
    shouldBackoff: true,
    turnHealth: "stalled",
    vetoProb: params.vetoProb,
    operationalSummary: params.operationalSummary,
  };
}

// Unused constant kept to avoid potential import-side-effect removal
void OMEGA_HEARTBEAT_CONTINUE_DELAY_MS;
