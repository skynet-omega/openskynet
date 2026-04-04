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

const OMEGA_WSP_MAX_AUTHORITY_STALENESS_MS = 6 * 60 * 60 * 1000;

export function hasActiveOmegaWspDriveAuthority(
  wsp?: OmegaWorldStatePersistent,
  nowMs: number = Date.now(),
): wsp is OmegaWorldStatePersistent {
  if (!wsp) {
    return false;
  }
  const ageMs =
    typeof wsp.updatedAt === "number" && Number.isFinite(wsp.updatedAt)
      ? nowMs - wsp.updatedAt
      : null;
  if (ageMs !== null && ageMs > OMEGA_WSP_MAX_AUTHORITY_STALENESS_MS) {
    return false;
  }
  return wsp.updateCount > 0;
}

export function deriveOmegaStateAuthoritySnapshot(params: {
  kernel?: OmegaSelfTimeKernelState;
  controllerState?: OmegaExecutionControllerState;
  operationalSummary?: OmegaOperationalMemorySummary;
  worldSnapshot?: OmegaWorldModelSnapshot;
  wsp?: OmegaWorldStatePersistent;
  nowMs?: number;
}): OmegaStateAuthoritySnapshot {
  const nowMs = params.nowMs ?? Date.now();
  const wspAgeMs =
    typeof params.wsp?.updatedAt === "number" && Number.isFinite(params.wsp.updatedAt)
      ? nowMs - params.wsp.updatedAt
      : undefined;
  const wspWasPreviouslyCalibrated = (params.wsp?.updateCount ?? 0) > 0;
  const wspAuthorityActive = hasActiveOmegaWspDriveAuthority(params.wsp, nowMs);
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
      status:
        !params.operationalSummary || params.operationalSummary.freshness === "stale"
          ? "fallback"
          : params.operationalSummary.freshness === "aging"
            ? "derived"
            : "authoritative",
      reason: !params.operationalSummary
        ? "operational_summary_unavailable"
        : params.operationalSummary.freshness === "stale"
          ? "recent_turn_health_stale"
          : params.operationalSummary.freshness === "aging"
            ? "recent_turn_health_aging"
            : "recent_turn_health_is_fresh",
    },
    worldObservation: {
      source: "world-model",
      status: params.worldSnapshot ? "derived" : "fallback",
      reason: params.worldSnapshot
        ? "empirical_world_snapshot_loaded"
        : "world_snapshot_not_requested_or_unavailable",
    },
    drives: wspAuthorityActive
      ? {
          source: "omega-wsp",
          status: "authoritative",
          reason: "persistent_homeostatic_drive_state_calibrated",
        }
      : params.wsp &&
          wspWasPreviouslyCalibrated &&
          typeof wspAgeMs === "number" &&
          wspAgeMs > OMEGA_WSP_MAX_AUTHORITY_STALENESS_MS
        ? {
            source: "omega-wsp",
            status: "fallback",
            reason: "persistent_drive_state_stale",
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
