import { loadOmegaDecisionContext, type OmegaDecisionContext } from "./decision-context.js";
import {
  loadOpenSkynetInternalProjectProfile,
  type OpenSkynetInternalProjectProfile,
} from "./internal-project.js";
import {
  collectOpenSkynetMemoryCandidates,
  loadOpenSkynetLivingState,
  type OpenSkynetLivingState,
} from "./living-memory.js";
import {
  loadOmegaRuntimeObserverSignal,
  type OmegaRuntimeObserverSignal,
} from "./runtime-observer.js";
import type { OmegaWorldModelSnapshot } from "./world-model.js";

export type OpenSkynetOmegaRuntimeAuthority = {
  workspaceRoot: string;
  sessionKey: string;
  project: OpenSkynetInternalProjectProfile;
  memoryCandidates: string[];
  decisionContext: OmegaDecisionContext;
  worldSnapshot?: OmegaWorldModelSnapshot;
  livingState?: OpenSkynetLivingState;
  runtimeObserver?: OmegaRuntimeObserverSignal;
};

export async function loadOpenSkynetOmegaRuntimeAuthority(params: {
  workspaceRoot: string;
  sessionKey: string;
  includeWorldSnapshot?: boolean | "urgent_maintenance";
  task?: string;
  expectedPaths?: string[];
  watchedPaths?: string[];
}): Promise<OpenSkynetOmegaRuntimeAuthority> {
  const memoryCandidates = await collectOpenSkynetMemoryCandidates(params.workspaceRoot);
  const [project, decisionContext, livingState, runtimeObserver] = await Promise.all([
    loadOpenSkynetInternalProjectProfile(params.workspaceRoot),
    loadOmegaDecisionContext({
      workspaceRoot: params.workspaceRoot,
      sessionKey: params.sessionKey,
      memoryCandidates,
      includeWorldSnapshot: params.includeWorldSnapshot,
      task: params.task,
      expectedPaths: params.expectedPaths,
      watchedPaths: params.watchedPaths,
    }),
    loadOpenSkynetLivingState({
      workspaceRoot: params.workspaceRoot,
      sessionKey: params.sessionKey,
    }),
    loadOmegaRuntimeObserverSignal(params.workspaceRoot),
  ]);

  return {
    workspaceRoot: params.workspaceRoot,
    sessionKey: params.sessionKey,
    project,
    memoryCandidates,
    decisionContext,
    worldSnapshot: decisionContext.controllerState?.worldSnapshot,
    livingState,
    runtimeObserver,
  };
}
