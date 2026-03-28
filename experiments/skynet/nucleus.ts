import fs from "node:fs/promises";
import path from "node:path";
import type { OmegaOperationalTurnMemoryEntry } from "../../src/omega/operational-memory.js";
import type { OmegaStudyFocus } from "../../src/omega/study-supervisor.js";

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

function sanitizeSessionKey(sessionKey: string): string {
  return (sessionKey.trim() || "main").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 64) || "main";
}

function resolveSkynetNucleusFile(params: { workspaceRoot: string; sessionKey: string }) {
  return path.join(
    params.workspaceRoot,
    ".openskynet",
    "skynet-nucleus",
    `${sanitizeSessionKey(params.sessionKey)}.json`,
  );
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function averageLatencyMs(entries: OmegaOperationalTurnMemoryEntry[]): number {
  if (entries.length === 0) return 0;
  return (
    entries.reduce((sum, entry) => sum + (entry.latencyBreakdown.totalMs || 0), 0) / entries.length
  );
}

function deriveMode(params: {
  studyFocus: OmegaStudyFocus;
  operationalSignals: OmegaOperationalTurnMemoryEntry[];
}): SkynetNucleusMode {
  const stalledTurns = params.operationalSignals.filter(
    (entry) => entry.turnHealth === "stalled",
  ).length;
  const progressingTurns = params.operationalSignals.filter(
    (entry) => entry.turnHealth === "progressing" || entry.turnHealth === "resolved",
  ).length;

  if (params.studyFocus.key === "decision_bifurcation" || stalledTurns >= 2) {
    return "reframe";
  }
  if (params.studyFocus.key === "cognitive_metabolism") {
    return "stabilize";
  }
  if (params.studyFocus.key === "endogenous_science_agenda") {
    return "explore";
  }
  if (progressingTurns > stalledTurns) {
    return "exploit";
  }
  return "explore";
}

function buildExecutive(params: {
  projectName: string;
  studyFocus: OmegaStudyFocus;
  mode: SkynetNucleusMode;
}): SkynetExecutiveLobe {
  const activeQuestionByTrack: Record<OmegaStudyFocus["key"], string> = {
    memory_selective_rewrite: `How can ${params.projectName} change local structure without destroying coherent global state?`,
    decision_bifurcation: "What stabilizes a real commitment instead of another local score bump?",
    cognitive_metabolism: `What should ${params.projectName} stop doing so cognition has real cost and real pressure?`,
    bicameral_core: `How should ${params.projectName} split executive logic from dynamic pattern processing?`,
    endogenous_science_agenda: `What study line should ${params.projectName} carry across cycles without external prompting?`,
  };
  const commitmentBase =
    params.mode === "reframe" ? 0.68 : params.mode === "stabilize" ? 0.72 : 0.62;

  return {
    macroGoal: `Advance ${params.studyFocus.title} as the next concrete ${params.projectName} line.`,
    activeQuestion: activeQuestionByTrack[params.studyFocus.key],
    commitment: clamp01(commitmentBase + params.studyFocus.priority * 0.2),
  };
}

function buildMetabolism(params: {
  mode: SkynetNucleusMode;
  operationalSignals: OmegaOperationalTurnMemoryEntry[];
}): SkynetMetabolism {
  const avgLatency = averageLatencyMs(params.operationalSignals);
  const stalledTurns = params.operationalSignals.filter(
    (entry) => entry.turnHealth === "stalled",
  ).length;
  const strain = clamp01((avgLatency / 20_000) * 0.6 + stalledTurns * 0.12);
  const curiosityBase = params.mode === "explore" ? 0.72 : params.mode === "reframe" ? 0.64 : 0.4;
  return {
    budget: clamp01(1 - strain * 0.55),
    strain,
    curiosity: clamp01(curiosityBase + (params.operationalSignals.length === 0 ? 0.08 : 0)),
    conservationBias: clamp01(params.mode === "stabilize" ? 0.8 : 0.45 + strain * 0.3),
  };
}

function buildPatternField(params: {
  mode: SkynetNucleusMode;
  operationalSignals: OmegaOperationalTurnMemoryEntry[];
  learnedConstraints: string[];
}): SkynetPatternField {
  const progressed = params.operationalSignals.some((entry) => entry.progressObserved);
  const coherence = clamp01(
    0.42 + (progressed ? 0.16 : 0) + params.learnedConstraints.length * 0.04,
  );
  const plasticityBase =
    params.mode === "explore"
      ? 0.78
      : params.mode === "reframe"
        ? 0.74
        : params.mode === "exploit"
          ? 0.48
          : 0.34;
  const localityBias =
    params.learnedConstraints.includes("touch_required_targets") ||
    params.learnedConstraints.includes("touch_every_required_target")
      ? 0.78
      : 0.52;
  return {
    coherence,
    plasticity: clamp01(plasticityBase),
    localityBias: clamp01(localityBias),
  };
}

function formatUnique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, 8);
}

export function deriveSkynetNucleusState(params: {
  sessionKey: string;
  projectName?: string;
  studyFocus: OmegaStudyFocus;
  operationalSignals: OmegaOperationalTurnMemoryEntry[];
  learnedConstraints?: string[];
}): SkynetNucleusState {
  const projectName = params.projectName?.trim() || "Skynet";
  const learnedConstraints = formatUnique(params.learnedConstraints ?? []);
  const mode = deriveMode({
    studyFocus: params.studyFocus,
    operationalSignals: params.operationalSignals,
  });
  return {
    sessionKey: params.sessionKey,
    updatedAt: Date.now(),
    name: projectName,
    mode,
    executive: buildExecutive({
      projectName,
      studyFocus: params.studyFocus,
      mode,
    }),
    metabolism: buildMetabolism({
      mode,
      operationalSignals: params.operationalSignals,
    }),
    patternField: buildPatternField({
      mode,
      operationalSignals: params.operationalSignals,
      learnedConstraints,
    }),
    supportingStudyTrack: params.studyFocus.key,
    supportingAgendaClassKeys: params.studyFocus.supportingAgendaClassKeys,
    learnedConstraints,
  };
}

export async function syncSkynetNucleus(params: {
  workspaceRoot: string;
  sessionKey: string;
  projectName?: string;
  studyFocus: OmegaStudyFocus;
  operationalSignals: OmegaOperationalTurnMemoryEntry[];
  learnedConstraints?: string[];
}): Promise<SkynetNucleusState> {
  const state = deriveSkynetNucleusState({
    sessionKey: params.sessionKey,
    projectName: params.projectName,
    studyFocus: params.studyFocus,
    operationalSignals: params.operationalSignals,
    learnedConstraints: params.learnedConstraints,
  });
  const filePath = resolveSkynetNucleusFile({
    workspaceRoot: params.workspaceRoot,
    sessionKey: params.sessionKey,
  });
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(state, null, 2) + "\n", "utf-8");
  return state;
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
