import type { OmegaOperationalTurnMemoryEntry } from "./operational-memory.js";
import type {
  OmegaStudyFocus,
  OmegaStudySupervisorState,
  OmegaStudyTrack,
} from "./study-supervisor.js";

export type SkynetNucleusMode = "stabilize" | "explore" | "exploit" | "reframe";

export type SkynetExecutiveLobe = {
  macroGoal: string;
  activeQuestion: string;
  commitment: number;
};

export type SkynetMetabolism = {
  budget: number;
  strain: number;
  curiosity: number;
  conservationBias: number;
};

export type SkynetPatternField = {
  coherence: number;
  plasticity: number;
  localityBias: number;
};

export type SkynetNucleusState = {
  sessionKey: string;
  updatedAt: number;
  name: string;
  mode: SkynetNucleusMode;
  executive: SkynetExecutiveLobe;
  metabolism: SkynetMetabolism;
  patternField: SkynetPatternField;
  supportingStudyTrack: OmegaStudyFocus["key"];
  supportingAgendaClassKeys: string[];
  learnedConstraints: string[];
};

export type SkynetStudyWorkItem = {
  id: string;
  title: string;
  trackKey: OmegaStudyTrack["key"];
  priority: number;
  rationale: string;
  deliverable: string;
  doneWhen: string;
};

export type SkynetStudyProgram = {
  sessionKey: string;
  updatedAt: number;
  projectName: string;
  focusKey: OmegaStudyTrack["key"];
  mode: SkynetNucleusState["mode"];
  items: SkynetStudyWorkItem[];
};

export type SkynetContinuityState = {
  sessionKey: string;
  updatedAt: number;
  projectName: string;
  cycleCount: number;
  currentFocusKey: SkynetStudyProgram["focusKey"];
  currentMode: SkynetNucleusState["mode"];
  focusStreak: number;
  retainedItemIds: string[];
  modeShiftCount: number;
  continuityScore: number;
};

export type SkynetExperimentPlan = {
  sessionKey: string;
  updatedAt: number;
  projectName: string;
  focusKey: string;
  mode: SkynetNucleusState["mode"];
  hypothesis: string;
  deliverable: string;
  killCriteria: string;
  benchmarkHook: string;
  notes: string[];
};

export type SkynetCommitmentDecision = {
  sessionKey: string;
  updatedAt: number;
  projectName: string;
  kind: "artifact" | "reframe" | "stabilize";
  artifactKind: "module" | "benchmark" | "note";
  targetFocusKey: string;
  chosenWorkItemId?: string;
  chosenWorkItemTitle?: string;
  rationale: string;
  executableTask: string;
  confidence: number;
};

export type SkynetBifurcationState =
  | {
      sessionKey: string;
      updatedAt: number;
      branchKind: string;
      rationale: string;
    }
  | undefined;

type SkynetNucleusModule = {
  syncSkynetNucleus(params: {
    workspaceRoot: string;
    sessionKey: string;
    projectName?: string;
    studyFocus: OmegaStudyFocus;
    operationalSignals: OmegaOperationalTurnMemoryEntry[];
    learnedConstraints?: string[];
  }): Promise<SkynetNucleusState>;
};

type SkynetProgramModule = {
  syncSkynetStudyProgram(params: {
    workspaceRoot: string;
    sessionKey: string;
    supervisor: OmegaStudySupervisorState;
    nucleus: SkynetNucleusState;
  }): Promise<SkynetStudyProgram>;
};

type SkynetContinuityModule = {
  syncSkynetContinuityState(params: {
    workspaceRoot: string;
    sessionKey: string;
    nucleus: SkynetNucleusState;
    program: SkynetStudyProgram;
  }): Promise<SkynetContinuityState>;
};

async function loadSkynetModule<T>(specifier: string): Promise<T> {
  const base = "../skynet";
  return (await import(`${base}/${specifier}`)) as T;
}

export async function syncOptionalSkynetNucleus(params: {
  workspaceRoot: string;
  sessionKey: string;
  projectName?: string;
  studyFocus: OmegaStudyFocus;
  operationalSignals: OmegaOperationalTurnMemoryEntry[];
  learnedConstraints?: string[];
}): Promise<SkynetNucleusState> {
  const mod = await loadSkynetModule<SkynetNucleusModule>("nucleus.js");
  return mod.syncSkynetNucleus(params);
}

export async function syncOptionalSkynetStudyProgram(params: {
  workspaceRoot: string;
  sessionKey: string;
  supervisor: OmegaStudySupervisorState;
  nucleus: SkynetNucleusState;
}): Promise<SkynetStudyProgram> {
  const mod = await loadSkynetModule<SkynetProgramModule>("study-program.js");
  return mod.syncSkynetStudyProgram(params);
}

export async function syncOptionalSkynetContinuityState(params: {
  workspaceRoot: string;
  sessionKey: string;
  nucleus: SkynetNucleusState;
  program: SkynetStudyProgram;
}): Promise<SkynetContinuityState> {
  const mod = await loadSkynetModule<SkynetContinuityModule>("continuity-tracker.js");
  return mod.syncSkynetContinuityState(params);
}

export function formatSkynetNucleusBlock(state: SkynetNucleusState): string[] {
  return [
    `[${state.name} Nucleus]`,
    `Mode: ${state.mode}`,
    `Macro goal: ${state.executive.macroGoal}`,
    `Active question: ${state.executive.activeQuestion}`,
    `Commitment: ${state.executive.commitment.toFixed(2)}`,
    `Metabolism: budget=${state.metabolism.budget.toFixed(2)} strain=${state.metabolism.strain.toFixed(2)} curiosity=${state.metabolism.curiosity.toFixed(2)}`,
    `Pattern field: coherence=${state.patternField.coherence.toFixed(2)} plasticity=${state.patternField.plasticity.toFixed(2)} locality=${state.patternField.localityBias.toFixed(2)}`,
    `Study track: ${state.supportingStudyTrack}`,
  ];
}

export function formatSkynetStudyProgramBlock(program?: SkynetStudyProgram): string[] {
  if (!program || program.items.length === 0) {
    return [];
  }
  const lines = ["", `[${program.projectName} Study Program]`];
  const top = program.items[0]!;
  lines.push(`Mode: ${program.mode}`);
  lines.push(`Primary work item: ${top.title} (${top.priority.toFixed(2)})`);
  lines.push(`Deliverable: ${top.deliverable}`);
  lines.push(`Done when: ${top.doneWhen}`);
  const secondary = program.items
    .slice(1, 3)
    .map((item) => `${item.title} (${item.priority.toFixed(2)})`);
  if (secondary.length > 0) {
    lines.push(`Secondary items: ${secondary.join(" | ")}`);
  }
  return lines;
}

export function formatSkynetContinuityBlock(state?: SkynetContinuityState): string[] {
  if (!state) {
    return [];
  }
  return [
    "",
    `[${state.projectName} Continuity]`,
    `Focus: ${state.currentFocusKey} (streak ${state.focusStreak})`,
    `Mode: ${state.currentMode} | mode shifts ${state.modeShiftCount}`,
    `Continuity score: ${state.continuityScore.toFixed(2)}`,
  ];
}
