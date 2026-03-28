import type {
  InternalProjectContinuityState,
  InternalProjectNucleusState,
  InternalProjectStudyProgram,
} from "../../src/omega/internal-project-framework.js";
import {
  loadOpenSkynetInternalProjectProfile,
  type OpenSkynetInternalProjectProfile,
} from "../../src/omega/internal-project.js";
import {
  syncOpenSkynetLivingMemory,
  type OpenSkynetLivingState,
} from "../../src/omega/living-memory.js";
import {
  loadOpenSkynetOmegaRuntimeAuthority,
  type OpenSkynetColdDirective,
} from "../../src/omega/runtime-authority.js";
import {
  loadOmegaWorldModelSnapshot,
  type OmegaWorldModelSnapshot,
} from "../../src/omega/world-model.js";
import {
  syncSkynetCommitmentDecision,
  type SkynetCommitmentDecision,
} from "./commitment-engine.js";
import { syncSkynetExperimentPlan, type SkynetExperimentPlan } from "./experiment-cycle.js";

export type OpenSkynetRuntimeAuthority = {
  sessionKey: string;
  project: OpenSkynetInternalProjectProfile;
  snapshot: OmegaWorldModelSnapshot;
  recommendedAction: string;
  experimentPlan?: SkynetExperimentPlan;
  commitment?: SkynetCommitmentDecision;
  livingState: OpenSkynetLivingState;
  coldDirective: OpenSkynetColdDirective;
};

export type OpenSkynetRuntimeProjectState = {
  nucleus?: InternalProjectNucleusState;
  program?: InternalProjectStudyProgram;
  continuity?: InternalProjectContinuityState;
};

export function resolveOpenSkynetRuntimeProjectState(
  snapshot: OmegaWorldModelSnapshot,
): OpenSkynetRuntimeProjectState {
  return {
    nucleus: snapshot.internalProjectNucleus ?? snapshot.skynetNucleus,
    program: snapshot.internalProjectStudyProgram ?? snapshot.skynetStudyProgram,
    continuity: snapshot.internalProjectContinuity ?? snapshot.skynetContinuity,
  };
}

export function deriveOpenSkynetRecommendedAction(params: {
  focusTitle?: string;
  nucleusMode?: string;
  continuityScore?: number;
  topWorkItem?: string;
}): string {
  if (typeof params.continuityScore === "number" && params.continuityScore < 0.5) {
    return "Re-establish continuity before expanding the study scope.";
  }
  if (params.nucleusMode === "reframe") {
    return "Produce a structural reframe before insisting on the same work item.";
  }
  if (params.topWorkItem) {
    return `Execute or refine the top work item: ${params.topWorkItem}`;
  }
  if (params.focusTitle) {
    return `Advance the active focus: ${params.focusTitle}`;
  }
  return "No active internal project focus detected.";
}

export async function syncOpenSkynetRuntimeAuthority(params: {
  workspaceRoot: string;
  sessionKey: string;
  task?: string;
  expectedPaths?: string[];
  watchedPaths?: string[];
}): Promise<OpenSkynetRuntimeAuthority> {
  const project = await loadOpenSkynetInternalProjectProfile(params.workspaceRoot);
  const snapshot = await loadOmegaWorldModelSnapshot({
    workspaceRoot: params.workspaceRoot,
    sessionKey: params.sessionKey,
    task: params.task,
    expectedPaths: params.expectedPaths,
    watchedPaths: params.watchedPaths,
  });
  const projectState = resolveOpenSkynetRuntimeProjectState(snapshot);

  const experimentPlan =
    projectState.nucleus && projectState.program
      ? await syncSkynetExperimentPlan({
          workspaceRoot: params.workspaceRoot,
          sessionKey: params.sessionKey,
          nucleus: projectState.nucleus,
          program: projectState.program,
          continuity: projectState.continuity,
        }).catch(() => undefined)
      : undefined;
  const commitment =
    projectState.nucleus && projectState.program && experimentPlan
      ? await syncSkynetCommitmentDecision({
          workspaceRoot: params.workspaceRoot,
          sessionKey: params.sessionKey,
          nucleus: projectState.nucleus,
          program: projectState.program,
          experiment: experimentPlan,
          continuity: projectState.continuity,
        }).catch(() => undefined)
      : undefined;

  const recommendedAction = deriveOpenSkynetRecommendedAction({
    focusTitle: snapshot.studySupervisor?.focus.title,
    nucleusMode: projectState.nucleus?.mode,
    continuityScore: projectState.continuity?.continuityScore,
    topWorkItem: projectState.program?.items[0]?.title,
  });
  const livingState = await syncOpenSkynetLivingMemory({
    workspaceRoot: params.workspaceRoot,
    sessionKey: params.sessionKey,
    snapshot,
    recommendedAction,
    commitment,
    experiment: experimentPlan,
  });
  const omegaAuthority = await loadOpenSkynetOmegaRuntimeAuthority({
    workspaceRoot: params.workspaceRoot,
    sessionKey: params.sessionKey,
  });

  return {
    sessionKey: params.sessionKey,
    project,
    snapshot,
    recommendedAction,
    experimentPlan,
    commitment,
    livingState,
    coldDirective: omegaAuthority.coldDirective,
  };
}
