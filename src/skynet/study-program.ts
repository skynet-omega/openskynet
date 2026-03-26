import fs from "node:fs/promises";
import path from "node:path";
import type { OmegaStudySupervisorState, OmegaStudyTrack } from "../omega/study-supervisor.js";
import type { SkynetNucleusState } from "./nucleus.js";

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
  focusKey: OmegaStudyTrack["key"];
  mode: SkynetNucleusState["mode"];
  items: SkynetStudyWorkItem[];
};

function sanitizeSessionKey(sessionKey: string): string {
  return (sessionKey.trim() || "main").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 64) || "main";
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function resolveStudyProgramJsonPath(params: {
  workspaceRoot: string;
  sessionKey: string;
}): string {
  return path.join(
    params.workspaceRoot,
    ".openskynet",
    "skynet-study-program",
    `${sanitizeSessionKey(params.sessionKey)}.json`,
  );
}

function resolveStudyProgramMarkdownPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, "memory", "SKYNET_STUDY_PROGRAM.md");
}

function trackByKey(
  tracks: OmegaStudyTrack[],
  key: OmegaStudyTrack["key"],
): OmegaStudyTrack | undefined {
  return tracks.find((track) => track.key === key);
}

function makeWorkItem(params: {
  id: string;
  title: string;
  track: OmegaStudyTrack;
  priority: number;
  rationale: string;
  deliverable: string;
  doneWhen: string;
}): SkynetStudyWorkItem {
  return {
    id: params.id,
    title: params.title,
    trackKey: params.track.key,
    priority: clamp01(params.priority),
    rationale: params.rationale,
    deliverable: params.deliverable,
    doneWhen: params.doneWhen,
  };
}

export function deriveSkynetStudyProgram(params: {
  sessionKey: string;
  supervisor: OmegaStudySupervisorState;
  nucleus: SkynetNucleusState;
}): SkynetStudyProgram {
  const focusTrack =
    trackByKey(params.supervisor.tracks, params.supervisor.focus.key) ??
    params.supervisor.tracks[0]!;
  const secondaryTrack =
    params.supervisor.tracks.find((track) => track.key !== focusTrack.key) ?? focusTrack;
  const metabolismTrack =
    trackByKey(params.supervisor.tracks, "cognitive_metabolism") ?? secondaryTrack;

  const items: SkynetStudyWorkItem[] = [
    makeWorkItem({
      id: "focus-experiment",
      title: `Empujar foco activo: ${focusTrack.title}`,
      track: focusTrack,
      priority: clamp01(focusTrack.priority + 0.08),
      rationale: focusTrack.whyNow,
      deliverable: focusTrack.nextExperiment,
      doneWhen: focusTrack.successCriteria,
    }),
    makeWorkItem({
      id: "stability-bridge",
      title:
        params.nucleus.mode === "reframe"
          ? "Reencuadrar el núcleo antes de insistir"
          : "Traducir el foco en una pieza estable de arquitectura",
      track: secondaryTrack,
      priority: clamp01(secondaryTrack.priority + (params.nucleus.mode === "reframe" ? 0.1 : 0.03)),
      rationale:
        params.nucleus.mode === "reframe"
          ? "El núcleo detecta presión o estancamiento; insistir sin reframe degradaría el estudio."
          : "El foco necesita convertirse en estructura para no disiparse entre ciclos.",
      deliverable:
        params.nucleus.mode === "reframe"
          ? `Producir una nueva formulación ejecutiva o prototipo mínimo para ${secondaryTrack.title}.`
          : `Convertir ${secondaryTrack.title} en módulo, adapter o experimento persistente dentro del repo.`,
      doneWhen:
        params.nucleus.mode === "reframe"
          ? "El siguiente ciclo ya no repite el mismo atasco y el enfoque cambia materialmente."
          : "Existe un artefacto nuevo y verificable, no solo notas.",
    }),
    makeWorkItem({
      id: "evidence-loop",
      title: "Cerrar el bucle empírico del estudio",
      track: metabolismTrack,
      priority: clamp01(Math.max(0.45, metabolismTrack.priority)),
      rationale:
        "Skynet no debe acumular teoría sin medición; cada ciclo libre debe dejar evidencia o criterio de descarte.",
      deliverable:
        "Agregar o actualizar un benchmark, test, logger o criterio de kill que mida si el estudio cambió conducta futura.",
      doneWhen:
        "Queda una validación ejecutable o un criterio de descarte explícito asociado al experimento activo.",
    }),
  ].sort((left, right) => right.priority - left.priority || left.title.localeCompare(right.title));

  return {
    sessionKey: params.sessionKey,
    updatedAt: Date.now(),
    focusKey: focusTrack.key,
    mode: params.nucleus.mode,
    items,
  };
}

function buildStudyProgramMarkdown(program: SkynetStudyProgram): string {
  const lines = [
    "# SKYNET Study Program",
    "",
    `Actualizado: ${new Date(program.updatedAt).toISOString()}`,
    `Sesion: ${program.sessionKey}`,
    `Modo del nucleo: ${program.mode}`,
    "",
    "## Work Items",
    "",
  ];

  program.items.forEach((item, index) => {
    lines.push(`### ${index + 1}. ${item.title}`);
    lines.push(`- Track: ${item.trackKey}`);
    lines.push(`- Prioridad: ${item.priority.toFixed(2)}`);
    lines.push(`- Rationale: ${item.rationale}`);
    lines.push(`- Deliverable: ${item.deliverable}`);
    lines.push(`- Done when: ${item.doneWhen}`);
    lines.push("");
  });

  return lines.join("\n").trim() + "\n";
}

export async function syncSkynetStudyProgram(params: {
  workspaceRoot: string;
  sessionKey: string;
  supervisor: OmegaStudySupervisorState;
  nucleus: SkynetNucleusState;
}): Promise<SkynetStudyProgram> {
  const program = deriveSkynetStudyProgram(params);
  const jsonPath = resolveStudyProgramJsonPath({
    workspaceRoot: params.workspaceRoot,
    sessionKey: params.sessionKey,
  });
  const markdownPath = resolveStudyProgramMarkdownPath(params.workspaceRoot);
  await fs.mkdir(path.dirname(jsonPath), { recursive: true });
  await fs.mkdir(path.dirname(markdownPath), { recursive: true });
  await fs.writeFile(jsonPath, JSON.stringify(program, null, 2) + "\n", "utf-8");
  await fs.writeFile(markdownPath, buildStudyProgramMarkdown(program), "utf-8");
  return program;
}

export function formatSkynetStudyProgramBlock(program?: SkynetStudyProgram): string[] {
  if (!program || program.items.length === 0) {
    return [];
  }
  const lines = ["", "[Skynet Study Program]"];
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
