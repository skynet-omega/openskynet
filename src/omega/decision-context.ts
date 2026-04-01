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
import type { OmegaSessionTimelineEntry } from "./session-context.js";
import {
  deriveOmegaStateAuthoritySnapshot,
  type OmegaStateAuthoritySnapshot,
} from "./state-authority.js";

export type OmegaDecisionDegradedComponent = {
  component: string;
  reason: string;
};

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
  degradedComponents: OmegaDecisionDegradedComponent[];
};

async function captureDecisionContextComponent<T>(
  component: string,
  degradedComponents: OmegaDecisionDegradedComponent[],
  operation: () => Promise<T>,
  fallback: () => Promise<T> | T,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    degradedComponents.push({
      component,
      reason: error instanceof Error ? error.message : String(error),
    });
    return await fallback();
  }
}

export async function loadOmegaDecisionContext(params: {
  workspaceRoot: string;
  sessionKey: string;
  memoryCandidates?: string[];
  includeWorldSnapshot?: boolean | "urgent_maintenance";
  task?: string;
  expectedPaths?: string[];
  watchedPaths?: string[];
}): Promise<OmegaDecisionContext> {
  const degradedComponents: OmegaDecisionDegradedComponent[] = [];
  const [controllerState, fallbackOperationalTail, wsp] = await Promise.all([
    captureDecisionContextComponent(
      "controller_state",
      degradedComponents,
      () =>
        syncOmegaExecutionControllerState({
          workspaceRoot: params.workspaceRoot,
          sessionKey: params.sessionKey,
          includeOperationalSummary: true,
          includeWorldSnapshot: params.includeWorldSnapshot,
          task: params.task,
          expectedPaths: params.expectedPaths,
          watchedPaths: params.watchedPaths,
        }),
      () => undefined,
    ),
    captureDecisionContextComponent(
      "operational_memory_tail",
      degradedComponents,
      () => loadOmegaOperationalMemoryTail(params),
      () => [],
    ),
    captureDecisionContextComponent(
      "omega_wsp",
      degradedComponents,
      () => loadOmegaWSP(params.workspaceRoot, params.sessionKey),
      () => undefined,
    ),
  ]);
  const sessionSnapshot = controllerState?.executiveState.sourceSessionAuthority ?? {
    timeline: [],
    state: undefined,
    kernel: undefined,
    transactions: [],
  };
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
    degradedComponents,
  };
}
