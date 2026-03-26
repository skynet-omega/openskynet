import fs from "node:fs/promises";
import path from "node:path";
import type { OmegaDurableMemoryEntry } from "./durable-memory.js";
import type { OmegaOperationalTurnMemoryEntry } from "./operational-memory.js";
import {
  deriveOmegaAgendaExecutionContract,
  type OmegaProblemAgendaItem,
} from "./problem-agenda.js";
import type { OmegaLocalityExecutionGuard } from "./world-model.js";

export type OmegaStudyTrackKey =
  | "memory_selective_rewrite"
  | "decision_bifurcation"
  | "cognitive_metabolism"
  | "bicameral_core"
  | "endogenous_science_agenda";

export type OmegaStudyTrack = {
  key: OmegaStudyTrackKey;
  title: string;
  thesis: string;
  whyNow: string;
  nextExperiment: string;
  successCriteria: string;
  priority: number;
  evidence: string[];
  supportingAgendaClassKeys: string[];
  lastUpdatedAt: number;
};

export type OmegaStudyFocus = {
  key: OmegaStudyTrackKey;
  title: string;
  thesis: string;
  whyNow: string;
  nextExperiment: string;
  successCriteria: string;
  priority: number;
  supportingAgendaClassKeys: string[];
};

export type OmegaStudySupervisorState = {
  sessionKey: string;
  updatedAt: number;
  focus: OmegaStudyFocus;
  tracks: OmegaStudyTrack[];
};

function sanitizeSessionKey(sessionKey: string): string {
  return (sessionKey.trim() || "main").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 64) || "main";
}

function resolveStudySupervisorFile(params: { workspaceRoot: string; sessionKey: string }) {
  return path.join(
    params.workspaceRoot,
    ".openskynet",
    "omega-study-supervisor",
    `${sanitizeSessionKey(params.sessionKey)}.json`,
  );
}

function resolveStudyQueueMarkdownFile(workspaceRoot: string) {
  return path.join(workspaceRoot, "memory", "OMEGA_STUDY_QUEUE.md");
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function formatEvidenceList(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, 6);
}

function countAgenda(params: {
  agenda: OmegaProblemAgendaItem[];
  classKey: string;
  minPriority?: number;
}): number {
  return params.agenda.filter(
    (item) =>
      item.classKey === params.classKey &&
      item.status !== "resolved" &&
      item.priority >= (params.minPriority ?? 0),
  ).length;
}

function countFailuresByKind(memories: OmegaDurableMemoryEntry[], errorKind: string): number {
  return memories
    .filter((entry) => entry.kind === "repeated_failure" && entry.errorKind === errorKind)
    .reduce((sum, entry) => sum + Math.max(entry.failureCount, 1), 0);
}

function averageLatencyMs(entries: OmegaOperationalTurnMemoryEntry[]): number {
  if (entries.length === 0) return 0;
  return (
    entries.reduce((sum, entry) => sum + (entry.latencyBreakdown.totalMs || 0), 0) / entries.length
  );
}

function buildTrackFromTemplate(params: {
  key: OmegaStudyTrackKey;
  title: string;
  thesis: string;
  whyNow: string;
  nextExperiment: string;
  successCriteria: string;
  priority: number;
  evidence: string[];
  supportingAgendaClassKeys?: string[];
}): OmegaStudyTrack {
  return {
    key: params.key,
    title: params.title,
    thesis: params.thesis,
    whyNow: params.whyNow,
    nextExperiment: params.nextExperiment,
    successCriteria: params.successCriteria,
    priority: clamp01(params.priority),
    evidence: formatEvidenceList(params.evidence),
    supportingAgendaClassKeys: Array.from(new Set(params.supportingAgendaClassKeys ?? [])),
    lastUpdatedAt: Date.now(),
  };
}

function deriveTrackSet(params: {
  problemAgenda: OmegaProblemAgendaItem[];
  relevantMemories: OmegaDurableMemoryEntry[];
  operationalSignals: OmegaOperationalTurnMemoryEntry[];
  learnedConstraints: string[];
  activeGoalTask?: string;
  localityExecutionGuard?: OmegaLocalityExecutionGuard;
}): OmegaStudyTrack[] {
  const failureTouchRequired =
    countFailuresByKind(params.relevantMemories, "target_not_touched") +
    countFailuresByKind(params.relevantMemories, "missing_target_writes") +
    countFailuresByKind(params.relevantMemories, "unexpected_collateral_writes");
  const stalledTurns = params.operationalSignals.filter(
    (entry) => entry.turnHealth === "stalled",
  ).length;
  const avgLatency = averageLatencyMs(params.operationalSignals);
  const autonomyAgendaCount = countAgenda({
    agenda: params.problemAgenda,
    classKey: "initiative:autonomy_improvement",
    minPriority: 0.45,
  });
  const stalledAgendaCount = countAgenda({
    agenda: params.problemAgenda,
    classKey: "initiative:stalled_progress",
    minPriority: 0.45,
  });
  const somaticAgendaCount = countAgenda({
    agenda: params.problemAgenda,
    classKey: "initiative:somatic_optimization",
    minPriority: 0.4,
  });
  const learnedConstraintSet = new Set(params.learnedConstraints);

  const memoryContract = deriveOmegaAgendaExecutionContract("failure:missing_target_writes");
  const agendaContract = deriveOmegaAgendaExecutionContract("initiative:autonomy_improvement");
  const metabolismContract = deriveOmegaAgendaExecutionContract("initiative:somatic_optimization");
  const stalledContract = deriveOmegaAgendaExecutionContract("initiative:stalled_progress");

  const memoryPriority =
    0.42 +
    Math.min(failureTouchRequired, 3) * 0.12 +
    (learnedConstraintSet.has("touch_required_targets") ? 0.12 : 0) +
    (learnedConstraintSet.has("touch_every_required_target") ? 0.08 : 0) +
    (params.localityExecutionGuard?.shouldIsolate ? 0.12 : 0);
  const memoryEvidence = [
    failureTouchRequired > 0
      ? `Hay ${failureTouchRequired} fallos relevantes sobre targets no tocados o collateral writes.`
      : "",
    learnedConstraintSet.has("touch_required_targets")
      ? "La memoria durable ya consolidó la restricción touch_required_targets."
      : "",
    learnedConstraintSet.has("touch_every_required_target")
      ? "La memoria durable ya consolidó la restricción touch_every_required_target."
      : "",
    params.localityExecutionGuard?.shouldIsolate
      ? `El locality guard sugiere aislar cambios en ${params.localityExecutionGuard.atRiskPaths.join(", ")}.`
      : "",
  ];

  const bifurcationPriority =
    0.36 +
    Math.min(stalledTurns, 3) * 0.08 +
    Math.min(stalledAgendaCount, 2) * 0.1 +
    (params.activeGoalTask ? 0.04 : 0.1);
  const bifurcationEvidence = [
    stalledTurns > 0 ? `Se observaron ${stalledTurns} turnos recientes estancados.` : "",
    stalledAgendaCount > 0
      ? "La agenda de stalled_progress sigue abierta y exige reencuadre estructural."
      : "",
    !params.activeGoalTask
      ? "No hay goal activo fuerte; conviene estudiar cómo estabilizar compromisos ejecutivos."
      : "",
  ];

  const metabolismPriority =
    0.34 +
    (avgLatency >= 15_000 ? 0.2 : avgLatency >= 8_000 ? 0.1 : 0) +
    Math.min(somaticAgendaCount, 2) * 0.12 +
    Math.min(stalledTurns, 2) * 0.05;
  const metabolismEvidence = [
    avgLatency > 0 ? `Latencia media reciente: ${(avgLatency / 1000).toFixed(1)}s.` : "",
    somaticAgendaCount > 0
      ? "La agenda somatic_optimization sugiere estrés metabólico del loop."
      : "",
    stalledTurns >= 2 ? "El estancamiento recurrente sugiere economía cognitiva insuficiente." : "",
  ];

  const bicameralPriority =
    0.4 +
    Math.min(autonomyAgendaCount, 2) * 0.09 +
    Math.min(stalledAgendaCount, 2) * 0.06 +
    (params.localityExecutionGuard?.shouldIsolate ? 0.08 : 0);
  const bicameralEvidence = [
    autonomyAgendaCount > 0
      ? "La agenda de autonomía sigue abierta: falta un núcleo más estable que solo routing/policy."
      : "",
    stalledAgendaCount > 0
      ? "La deriva ejecutiva sugiere separar mejor mecanismo de patrón y control."
      : "",
    params.localityExecutionGuard?.shouldIsolate
      ? "El conflicto entre exploración y preservación de estructura refuerza la tesis de un núcleo dual."
      : "",
  ];

  const agendaPriority =
    0.45 +
    Math.min(autonomyAgendaCount, 2) * 0.14 +
    (params.activeGoalTask ? 0 : 0.1) +
    (stalledTurns === 0 ? 0.05 : 0);
  const agendaEvidence = [
    autonomyAgendaCount > 0
      ? "La agenda autonomy_improvement sigue abierta como línea estructural."
      : "",
    !params.activeGoalTask ? "No hay un programa persistente de estudio seleccionado." : "",
    "La reconstrucción experimental indica que OpenSkyNet debe sostener una agenda propia, no solo reaccionar.",
  ];

  return [
    buildTrackFromTemplate({
      key: "memory_selective_rewrite",
      title: "Memoria selectiva con reescritura local",
      thesis:
        "La memoria útil no debe ser replay global; debe permitir cambio localizado sin destruir estructura correcta.",
      whyNow:
        failureTouchRequired > 0 || params.localityExecutionGuard?.shouldIsolate
          ? "Los fallos recientes siguen apuntando a preservación/localidad como muro real."
          : "Esta fue una de las líneas con más señal empírica en la historia experimental.",
      nextExperiment: memoryContract.deliverable,
      successCriteria: memoryContract.successCriteria,
      priority: memoryPriority,
      evidence: memoryEvidence,
      supportingAgendaClassKeys: params.problemAgenda
        .filter((item) => item.classKey.startsWith("failure:"))
        .map((item) => item.classKey),
    }),
    buildTrackFromTemplate({
      key: "decision_bifurcation",
      title: "Decisión como bifurcación y estabilización",
      thesis:
        "El sistema necesita compromisos ejecutivos más ricos que scoring plano o argmax local.",
      whyNow:
        stalledTurns > 0
          ? "El estancamiento reciente sugiere falta de mecanismo para estabilizar foco y reencuadre."
          : "La línea histórica de cristalización como decisión sigue sin traducción arquitectónica fuerte.",
      nextExperiment: stalledContract.deliverable,
      successCriteria: stalledContract.successCriteria,
      priority: bifurcationPriority,
      evidence: bifurcationEvidence,
      supportingAgendaClassKeys: params.problemAgenda
        .filter((item) => item.classKey === "initiative:stalled_progress")
        .map((item) => item.classKey),
    }),
    buildTrackFromTemplate({
      key: "cognitive_metabolism",
      title: "Metabolismo cognitivo real",
      thesis:
        "Pensar, insistir y explorar deben tener costo real para producir curiosidad y economía cognitiva duras.",
      whyNow:
        avgLatency >= 8_000
          ? "La latencia y el gasto del loop muestran estrés metabólico observable."
          : "La economía cognitiva sigue siendo una deuda explícita del sistema.",
      nextExperiment: metabolismContract.deliverable,
      successCriteria: metabolismContract.successCriteria,
      priority: metabolismPriority,
      evidence: metabolismEvidence,
      supportingAgendaClassKeys: params.problemAgenda
        .filter((item) => item.classKey === "initiative:somatic_optimization")
        .map((item) => item.classKey),
    }),
    buildTrackFromTemplate({
      key: "bicameral_core",
      title: "Núcleo dual o bicameral",
      thesis:
        "Ni el control lógico solo ni la dinámica continua sola bastan; se necesita un núcleo dual explícito.",
      whyNow:
        autonomyAgendaCount > 0
          ? "La agenda de autonomía sigue abierta y el stack actual parece demasiado monolítico."
          : "La historia V28/V31 sugiere que esta línea merece resurrección controlada.",
      nextExperiment:
        "Definir un prototipo mínimo con un módulo ejecutivo discreto y un módulo dinámico continuo, con interfaz causal explícita.",
      successCriteria:
        "El prototipo demuestra que ambos módulos cambian conducta futura de manera diferenciada y medible.",
      priority: bicameralPriority,
      evidence: bicameralEvidence,
      supportingAgendaClassKeys: params.problemAgenda
        .filter(
          (item) =>
            item.classKey === "initiative:autonomy_improvement" ||
            item.classKey === "initiative:stalled_progress",
        )
        .map((item) => item.classKey),
    }),
    buildTrackFromTemplate({
      key: "endogenous_science_agenda",
      title: "Agenda científica endógena",
      thesis:
        "OpenSkyNet debe sostener estudios con continuidad propia, no solo reaccionar a anomalías aisladas.",
      whyNow: !params.activeGoalTask
        ? "Hoy no hay una agenda de estudio persistente suficientemente explícita."
        : "El sistema necesita consolidar una línea de investigación que sobreviva entre ciclos.",
      nextExperiment: agendaContract.deliverable,
      successCriteria: agendaContract.successCriteria,
      priority: agendaPriority,
      evidence: agendaEvidence,
      supportingAgendaClassKeys: params.problemAgenda
        .filter((item) => item.classKey === "initiative:autonomy_improvement")
        .map((item) => item.classKey),
    }),
  ].sort((left, right) => right.priority - left.priority || left.title.localeCompare(right.title));
}

function buildFocus(tracks: OmegaStudyTrack[]): OmegaStudyFocus {
  const top = tracks[0]!;
  return {
    key: top.key,
    title: top.title,
    thesis: top.thesis,
    whyNow: top.whyNow,
    nextExperiment: top.nextExperiment,
    successCriteria: top.successCriteria,
    priority: top.priority,
    supportingAgendaClassKeys: top.supportingAgendaClassKeys,
  };
}

function buildStudyQueueMarkdown(state: OmegaStudySupervisorState): string {
  const lines = [
    "# SKYNET Study Queue",
    "",
    `Actualizado: ${new Date(state.updatedAt).toISOString()}`,
    `Sesion: ${state.sessionKey}`,
    "",
    "## Focus Activo",
    "",
    `- Track: ${state.focus.title}`,
    `- Prioridad: ${state.focus.priority.toFixed(2)}`,
    `- Tesis: ${state.focus.thesis}`,
    `- Por qué ahora: ${state.focus.whyNow}`,
    `- Próximo experimento: ${state.focus.nextExperiment}`,
    `- Criterio de éxito: ${state.focus.successCriteria}`,
    "",
    "## Tracks Priorizados",
    "",
  ];

  for (const track of state.tracks.slice(0, 5)) {
    lines.push(`### ${track.title}`);
    lines.push(`- Prioridad: ${track.priority.toFixed(2)}`);
    lines.push(`- Tesis: ${track.thesis}`);
    lines.push(`- Próximo experimento: ${track.nextExperiment}`);
    lines.push(`- Criterio de éxito: ${track.successCriteria}`);
    if (track.supportingAgendaClassKeys.length > 0) {
      lines.push(`- Agenda asociada: ${track.supportingAgendaClassKeys.join(", ")}`);
    }
    if (track.evidence.length > 0) {
      lines.push(`- Evidencia: ${track.evidence.join(" | ")}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim() + "\n";
}

async function persistStudyArtifacts(params: {
  workspaceRoot: string;
  state: OmegaStudySupervisorState;
}): Promise<void> {
  const jsonPath = resolveStudySupervisorFile({
    workspaceRoot: params.workspaceRoot,
    sessionKey: params.state.sessionKey,
  });
  const markdownPath = resolveStudyQueueMarkdownFile(params.workspaceRoot);
  await fs.mkdir(path.dirname(jsonPath), { recursive: true });
  await fs.mkdir(path.dirname(markdownPath), { recursive: true });
  await fs.writeFile(jsonPath, JSON.stringify(params.state, null, 2) + "\n", "utf-8");
  await fs.writeFile(markdownPath, buildStudyQueueMarkdown(params.state), "utf-8");
}

export async function syncOmegaStudySupervisor(params: {
  workspaceRoot: string;
  sessionKey: string;
  problemAgenda: OmegaProblemAgendaItem[];
  relevantMemories: OmegaDurableMemoryEntry[];
  operationalSignals: OmegaOperationalTurnMemoryEntry[];
  learnedConstraints?: string[];
  activeGoalTask?: string;
  localityExecutionGuard?: OmegaLocalityExecutionGuard;
}): Promise<OmegaStudySupervisorState> {
  const tracks = deriveTrackSet({
    problemAgenda: params.problemAgenda,
    relevantMemories: params.relevantMemories,
    operationalSignals: params.operationalSignals,
    learnedConstraints: params.learnedConstraints ?? [],
    activeGoalTask: params.activeGoalTask,
    localityExecutionGuard: params.localityExecutionGuard,
  });
  const state: OmegaStudySupervisorState = {
    sessionKey: params.sessionKey,
    updatedAt: Date.now(),
    focus: buildFocus(tracks),
    tracks,
  };
  await persistStudyArtifacts({ workspaceRoot: params.workspaceRoot, state });
  return state;
}

export function formatOmegaStudySupervisorBlock(state?: OmegaStudySupervisorState): string[] {
  if (!state) {
    return [];
  }
  const lines = ["", "[SKYNET Study Supervisor]"];
  lines.push(`Focus: ${state.focus.title} (priority ${state.focus.priority.toFixed(2)})`);
  lines.push(`Thesis: ${state.focus.thesis}`);
  lines.push(`Why now: ${state.focus.whyNow}`);
  lines.push(`Next experiment: ${state.focus.nextExperiment}`);
  lines.push(`Success criteria: ${state.focus.successCriteria}`);
  if (state.focus.supportingAgendaClassKeys.length > 0) {
    lines.push(`Agenda links: ${state.focus.supportingAgendaClassKeys.join(", ")}`);
  }
  const secondary = state.tracks
    .slice(1, 3)
    .map((track) => `${track.title} (${track.priority.toFixed(2)})`);
  if (secondary.length > 0) {
    lines.push(`Secondary tracks: ${secondary.join(" | ")}`);
  }
  return lines;
}
