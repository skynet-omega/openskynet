import type { OmegaExecutionControllerState } from "./execution-controller.js";
import type { OmegaWorldStatePersistent } from "./omega-wsp.js";
import type { OmegaOperationalMemorySummary } from "./operational-memory.js";
import type { OmegaSelfTimeKernelState } from "./self-time-kernel.js";
import type { OmegaWorldModelSnapshot } from "./world-model.js";

export type OmegaStateAuthorityStatus = "authoritative" | "derived" | "fallback" | "experimental";

export type OmegaStateAuthoritySlot = {
  source:
    | "self-time-kernel"
    | "session-context"
    | "execution-controller"
    | "operational-memory"
    | "world-model"
    | "omega-wsp"
    | "kernel-fallback";
  status: OmegaStateAuthorityStatus;
  reason: string;
};

export type OmegaStateAuthoritySnapshot = {
  continuity: OmegaStateAuthoritySlot;
  executive: OmegaStateAuthoritySlot;
  operationalHealth: OmegaStateAuthoritySlot;
  worldObservation: OmegaStateAuthoritySlot;
  drives: OmegaStateAuthoritySlot;
};

export function hasActiveOmegaWspDriveAuthority(
  wsp?: OmegaWorldStatePersistent,
): wsp is OmegaWorldStatePersistent {
  if (!wsp) {
    return false;
  }
  if (wsp.updateCount > 0) {
    return true;
  }
  return wsp.drives.some((drive) => Math.abs(drive.error) > 0.01);
}

export function deriveOmegaStateAuthoritySnapshot(params: {
  kernel?: OmegaSelfTimeKernelState;
  controllerState?: OmegaExecutionControllerState;
  operationalSummary?: OmegaOperationalMemorySummary;
  worldSnapshot?: OmegaWorldModelSnapshot;
  wsp?: OmegaWorldStatePersistent;
}): OmegaStateAuthoritySnapshot {
  return {
    continuity: {
      source: params.kernel ? "self-time-kernel" : "session-context",
      status: params.kernel ? "authoritative" : "fallback",
      reason: params.kernel ? "verified_goal_and_tension_state" : "kernel_unavailable",
    },
    executive: {
      source: params.controllerState ? "execution-controller" : "kernel-fallback",
      status: params.controllerState ? "authoritative" : "fallback",
      reason: params.controllerState
        ? "shared_dispatch_plan_available"
        : "no_executive_snapshot_loaded",
    },
    operationalHealth: {
      source: "operational-memory",
      status: params.operationalSummary ? "authoritative" : "fallback",
      reason: params.operationalSummary
        ? "recent_turn_health_is_persisted"
        : "operational_summary_unavailable",
    },
    worldObservation: {
      source: "world-model",
      status: params.worldSnapshot ? "derived" : "fallback",
      reason: params.worldSnapshot
        ? "empirical_world_snapshot_loaded"
        : "world_snapshot_not_requested_or_unavailable",
    },
    drives: hasActiveOmegaWspDriveAuthority(params.wsp)
      ? {
          source: "omega-wsp",
          status: "authoritative",
          reason: "persistent_homeostatic_drive_state_available",
        }
      : {
          source: "kernel-fallback",
          status: params.wsp ? "experimental" : "fallback",
          reason: params.wsp
            ? "wsp_present_but_not_calibrated_for_runtime_control"
            : "no_persistent_drive_state_loaded",
        },
  };
}
