import {
  formatSkynetContinuityBlock,
  formatSkynetNucleusBlock,
  formatSkynetStudyProgramBlock,
  syncOptionalSkynetContinuityState,
  syncOptionalSkynetNucleus,
  syncOptionalSkynetStudyProgram,
  type SkynetContinuityState,
  type SkynetNucleusState,
  type SkynetStudyProgram,
} from "./internal-project-lab.js";
import type { OmegaOperationalTurnMemoryEntry } from "./operational-memory.js";
import type { OmegaStudySupervisorState } from "./study-supervisor.js";

export type OmegaWorldModelInternalProjectState = {
  internalProjectNucleus?: SkynetNucleusState;
  internalProjectStudyProgram?: SkynetStudyProgram;
  internalProjectContinuity?: SkynetContinuityState;
};

type DegradedComponent = {
  component: string;
  reason: string;
};

async function captureInternalProjectComponent<T>(
  component: string,
  degradedComponents: DegradedComponent[],
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

export async function loadOmegaWorldModelInternalProjectState(params: {
  workspaceRoot: string;
  sessionKey: string;
  projectName: string;
  studySupervisor?: OmegaStudySupervisorState;
  operationalSignals: OmegaOperationalTurnMemoryEntry[];
  learnedConstraints: string[];
  degradedComponents: DegradedComponent[];
}): Promise<OmegaWorldModelInternalProjectState> {
  const { studySupervisor } = params;
  if (!studySupervisor) {
    return {
      internalProjectNucleus: undefined,
      internalProjectStudyProgram: undefined,
      internalProjectContinuity: undefined,
    };
  }

  const internalProjectNucleus = await captureInternalProjectComponent(
    "skynet_nucleus",
    params.degradedComponents,
    () =>
      syncOptionalSkynetNucleus({
        workspaceRoot: params.workspaceRoot,
        sessionKey: params.sessionKey,
        projectName: params.projectName,
        studyFocus: studySupervisor.focus,
        operationalSignals: params.operationalSignals,
        learnedConstraints: params.learnedConstraints,
      }),
  );

  const internalProjectStudyProgram = internalProjectNucleus
    ? await captureInternalProjectComponent("skynet_study_program", params.degradedComponents, () =>
        syncOptionalSkynetStudyProgram({
          workspaceRoot: params.workspaceRoot,
          sessionKey: params.sessionKey,
          supervisor: studySupervisor,
          nucleus: internalProjectNucleus,
        }),
      )
    : undefined;

  const internalProjectContinuity =
    internalProjectNucleus && internalProjectStudyProgram
      ? await captureInternalProjectComponent("skynet_continuity", params.degradedComponents, () =>
          syncOptionalSkynetContinuityState({
            workspaceRoot: params.workspaceRoot,
            sessionKey: params.sessionKey,
            nucleus: internalProjectNucleus,
            program: internalProjectStudyProgram,
          }),
        )
      : undefined;

  return {
    internalProjectNucleus,
    internalProjectStudyProgram,
    internalProjectContinuity,
  };
}

export function formatOmegaWorldModelInternalProjectBlocks(
  state: OmegaWorldModelInternalProjectState,
): string[] {
  const lines: string[] = [];
  if (state.internalProjectNucleus) {
    lines.push("");
    lines.push(...formatSkynetNucleusBlock(state.internalProjectNucleus));
  }
  if (state.internalProjectStudyProgram) {
    lines.push(...formatSkynetStudyProgramBlock(state.internalProjectStudyProgram));
  }
  if (state.internalProjectContinuity) {
    lines.push(...formatSkynetContinuityBlock(state.internalProjectContinuity));
  }
  return lines;
}
