import {
  loadOpenSkynetInternalProjectProfile,
  type OpenSkynetInternalProjectProfile,
} from "../omega/internal-project.js";
import { syncOpenSkynetLivingMemory, type OpenSkynetLivingState } from "../omega/living-memory.js";
import { loadOmegaWorldModelSnapshot, type OmegaWorldModelSnapshot } from "../omega/world-model.js";
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
  degradedComponents: Array<{
    component: string;
    reason: string;
  }>;
};

async function captureRuntimeComponent<T>(
  component: string,
  degradedComponents: OpenSkynetRuntimeAuthority["degradedComponents"],
  operation: () => Promise<T>,
): Promise<T | undefined> {
  try {
    return await operation();
  } catch (error) {
    degradedComponents.push({
      component,
      reason: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
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
  const degradedComponents = [...snapshot.degradedComponents];

  const nucleus = snapshot.internalProjectNucleus;
  const program = snapshot.internalProjectStudyProgram;
  const continuity = snapshot.internalProjectContinuity;
  const experimentPlan =
    nucleus && program
      ? await captureRuntimeComponent("skynet_experiment_plan", degradedComponents, () =>
          syncSkynetExperimentPlan({
            workspaceRoot: params.workspaceRoot,
            sessionKey: params.sessionKey,
            nucleus,
            program,
            continuity,
          }),
        )
      : undefined;
  const commitment =
    experimentPlan && nucleus && program
      ? await captureRuntimeComponent("skynet_commitment", degradedComponents, () =>
          syncSkynetCommitmentDecision({
            workspaceRoot: params.workspaceRoot,
            sessionKey: params.sessionKey,
            nucleus,
            program,
            experiment: experimentPlan,
            continuity,
          }),
        )
      : undefined;

  const recommendedAction = deriveOpenSkynetRecommendedAction({
    focusTitle: snapshot.studySupervisor?.focus.title,
    nucleusMode: snapshot.internalProjectNucleus?.mode,
    continuityScore: snapshot.internalProjectContinuity?.continuityScore,
    topWorkItem: snapshot.internalProjectStudyProgram?.items[0]?.title,
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
    project,
    snapshot,
    recommendedAction,
    experimentPlan,
    commitment,
    livingState,
    degradedComponents,
  };
}
