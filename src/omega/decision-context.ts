import type { OmegaSessionSelfState } from "./event-model.js";
import {
  shouldDispatchOmegaHeartbeatPrompt,
  syncOmegaExecutionControllerState,
  type OmegaExecutionControllerState,
} from "./execution-controller.js";
import { loadOmegaWSP, type OmegaWorldStatePersistent } from "./omega-wsp.js";
import {
  loadOmegaOperationalMemoryTail,
  summarizeOmegaOperationalMemory,
  type OmegaOperationalMemorySummary,
} from "./operational-memory.js";
import { deriveOmegaPolicySnapshot, type OmegaPolicySnapshot } from "./policy-engine.js";
import type { OmegaSelfTimeKernelState } from "./self-time-kernel.js";
import {
  loadOmegaSessionDecisionState,
  type OmegaSessionTimelineEntry,
} from "./session-context.js";
import {
  deriveOmegaStateAuthoritySnapshot,
  type OmegaStateAuthoritySnapshot,
} from "./state-authority.js";

export type OmegaDecisionContext = {
  timeline: OmegaSessionTimelineEntry[];
  sessionState?: OmegaSessionSelfState;
  kernel?: OmegaSelfTimeKernelState;
  wsp?: OmegaWorldStatePersistent;
  controllerState?: OmegaExecutionControllerState;
  operationalSummary: OmegaOperationalMemorySummary;
  stateAuthority: OmegaStateAuthoritySnapshot;
  policy: OmegaPolicySnapshot;
  shouldDispatchHeartbeatPrompt: boolean;
};

export async function loadOmegaDecisionContext(params: {
  workspaceRoot: string;
  sessionKey: string;
  memoryCandidates?: string[];
  includeWorldSnapshot?: boolean | "urgent_maintenance";
  task?: string;
  expectedPaths?: string[];
  watchedPaths?: string[];
}): Promise<OmegaDecisionContext> {
  const [sessionSnapshot, controllerState, fallbackOperationalTail, wsp] = await Promise.all([
    loadOmegaSessionDecisionState(params),
    syncOmegaExecutionControllerState({
      workspaceRoot: params.workspaceRoot,
      sessionKey: params.sessionKey,
      includeOperationalSummary: true,
      includeWorldSnapshot: params.includeWorldSnapshot,
      task: params.task,
      expectedPaths: params.expectedPaths,
      watchedPaths: params.watchedPaths,
    }).catch(() => undefined),
    loadOmegaOperationalMemoryTail(params).catch(() => []),
    loadOmegaWSP(params.workspaceRoot, params.sessionKey).catch(() => undefined),
  ]);
  const operationalSummary =
    controllerState?.operationalSummary ?? summarizeOmegaOperationalMemory(fallbackOperationalTail);
  const stateAuthority = deriveOmegaStateAuthoritySnapshot({
    kernel: sessionSnapshot.kernel,
    controllerState,
    operationalSummary,
    worldSnapshot: controllerState?.worldSnapshot,
    wsp,
  });
  const policy = deriveOmegaPolicySnapshot({
    kernel: sessionSnapshot.kernel,
    wsp,
    nowMs: Date.now(),
    memoryCandidates: params.memoryCandidates,
    operationalSummary,
    hasUrgentMaintenance: controllerState?.hasUrgentMaintenance,
    stateAuthority,
  });

  return {
    timeline: sessionSnapshot.timeline,
    sessionState: sessionSnapshot.state,
    kernel: sessionSnapshot.kernel,
    wsp,
    controllerState,
    operationalSummary,
    stateAuthority,
    policy,
    shouldDispatchHeartbeatPrompt: controllerState
      ? shouldDispatchOmegaHeartbeatPrompt({
          dispatchPlan: controllerState.dispatchPlan,
          wakeAction: policy.wakeAction,
          shouldRunAutonomy: policy.shouldRunAutonomy,
        })
      : policy.wakeAction.kind !== "heartbeat_ok" || policy.shouldRunAutonomy,
  };
}
