import { syncOpenSkynetLivingMemory, type OpenSkynetLivingState } from "../omega/living-memory.js";
import { loadOmegaWorldModelSnapshot, type OmegaWorldModelSnapshot } from "../omega/world-model.js";
import {
  syncSkynetCommitmentDecision,
  type SkynetCommitmentDecision,
} from "./commitment-engine.js";
import { syncSkynetExperimentPlan, type SkynetExperimentPlan } from "./experiment-cycle.js";

export type OpenSkynetRuntimeAuthority = {
  sessionKey: string;
  snapshot: OmegaWorldModelSnapshot;
  recommendedAction: string;
  experimentPlan?: SkynetExperimentPlan;
  commitment?: SkynetCommitmentDecision;
  livingState: OpenSkynetLivingState;
};

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
  const snapshot = await loadOmegaWorldModelSnapshot({
    workspaceRoot: params.workspaceRoot,
    sessionKey: params.sessionKey,
    task: params.task,
    expectedPaths: params.expectedPaths,
    watchedPaths: params.watchedPaths,
  });

  const experimentPlan =
    snapshot.skynetNucleus && snapshot.skynetStudyProgram
      ? await syncSkynetExperimentPlan({
          workspaceRoot: params.workspaceRoot,
          sessionKey: params.sessionKey,
          nucleus: snapshot.skynetNucleus,
          program: snapshot.skynetStudyProgram,
          continuity: snapshot.skynetContinuity,
        }).catch(() => undefined)
      : undefined;
  const commitment =
    snapshot.skynetNucleus && snapshot.skynetStudyProgram && experimentPlan
      ? await syncSkynetCommitmentDecision({
          workspaceRoot: params.workspaceRoot,
          sessionKey: params.sessionKey,
          nucleus: snapshot.skynetNucleus,
          program: snapshot.skynetStudyProgram,
          experiment: experimentPlan,
          continuity: snapshot.skynetContinuity,
        }).catch(() => undefined)
      : undefined;

  const recommendedAction = deriveOpenSkynetRecommendedAction({
    focusTitle: snapshot.studySupervisor?.focus.title,
    nucleusMode: snapshot.skynetNucleus?.mode,
    continuityScore: snapshot.skynetContinuity?.continuityScore,
    topWorkItem: snapshot.skynetStudyProgram?.items[0]?.title,
  });
  const livingState = await syncOpenSkynetLivingMemory({
    workspaceRoot: params.workspaceRoot,
    sessionKey: params.sessionKey,
    snapshot,
    recommendedAction,
    commitment,
    experiment: experimentPlan,
  });

  return {
    sessionKey: params.sessionKey,
    snapshot,
    recommendedAction,
    experimentPlan,
    commitment,
    livingState,
  };
}
