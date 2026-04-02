import fs from "node:fs/promises";
import path from "node:path";
import type { SkynetNucleusState } from "./nucleus.js";
import type { SkynetStudyProgram } from "./study-program.js";

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

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function sanitizeSessionKey(sessionKey: string): string {
  return (sessionKey.trim() || "main").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 64) || "main";
}

function resolveContinuityJsonPath(params: { workspaceRoot: string; sessionKey: string }): string {
  return path.join(
    params.workspaceRoot,
    ".openskynet",
    "skynet-continuity",
    `${sanitizeSessionKey(params.sessionKey)}.json`,
  );
}

function resolveContinuityMarkdownPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, "memory", "SKYNET_CONTINUITY.md");
}

async function loadPriorContinuityState(params: {
  workspaceRoot: string;
  sessionKey: string;
}): Promise<SkynetContinuityState | undefined> {
  const filePath = resolveContinuityJsonPath(params);
  try {
    return JSON.parse(await fs.readFile(filePath, "utf-8")) as SkynetContinuityState;
  } catch {
    return undefined;
  }
}

export function deriveSkynetContinuityState(params: {
  sessionKey: string;
  nucleus: SkynetNucleusState;
  program: SkynetStudyProgram;
  prior?: SkynetContinuityState;
}): SkynetContinuityState {
  const prior = params.prior;
  const currentItemIds = params.program.items.map((item) => item.id);
  const retainedItemIds = prior
    ? currentItemIds.filter(
        (itemId) =>
          prior.retainedItemIds.includes(itemId) ||
          params.program.items.some((item) => item.id === itemId),
      )
    : currentItemIds;
  const retainedRatio =
    currentItemIds.length > 0 ? retainedItemIds.length / currentItemIds.length : 0;
  const sameFocus = prior?.currentFocusKey === params.program.focusKey;
  const sameMode = prior?.currentMode === params.nucleus.mode;
  const focusStreak = sameFocus ? (prior?.focusStreak ?? 0) + 1 : 1;
  const cycleCount = (prior?.cycleCount ?? 0) + 1;
  const modeShiftCount = (prior?.modeShiftCount ?? 0) + (sameMode || !prior ? 0 : 1);
  const continuityScore = clamp01(
    0.35 +
      Math.min(focusStreak, 4) * 0.12 +
      retainedRatio * 0.22 +
      (sameMode ? 0.1 : 0) -
      Math.min(modeShiftCount, 4) * 0.04,
  );

  return {
    sessionKey: params.sessionKey,
    updatedAt: Date.now(),
    projectName: params.nucleus.name,
    cycleCount,
    currentFocusKey: params.program.focusKey,
    currentMode: params.nucleus.mode,
    focusStreak,
    retainedItemIds,
    modeShiftCount,
    continuityScore,
  };
}

function buildContinuityMarkdown(state: SkynetContinuityState): string {
  return [
    `# ${state.projectName.toUpperCase()} Continuity`,
    "",
    `Actualizado: ${new Date(state.updatedAt).toISOString()}`,
    `Sesion: ${state.sessionKey}`,
    `Ciclos observados: ${state.cycleCount}`,
    `Focus actual: ${state.currentFocusKey}`,
    `Modo actual: ${state.currentMode}`,
    `Focus streak: ${state.focusStreak}`,
    `Mode shifts: ${state.modeShiftCount}`,
    `Continuity score: ${state.continuityScore.toFixed(2)}`,
    "",
    `Retained work items: ${state.retainedItemIds.join(", ") || "none"}`,
    "",
  ].join("\n");
}

export async function syncSkynetContinuityState(params: {
  workspaceRoot: string;
  sessionKey: string;
  nucleus: SkynetNucleusState;
  program: SkynetStudyProgram;
}): Promise<SkynetContinuityState> {
  const prior = await loadPriorContinuityState(params);
  const state = deriveSkynetContinuityState({
    sessionKey: params.sessionKey,
    nucleus: params.nucleus,
    program: params.program,
    prior,
  });
  const jsonPath = resolveContinuityJsonPath(params);
  const markdownPath = resolveContinuityMarkdownPath(params.workspaceRoot);
  await fs.mkdir(path.dirname(jsonPath), { recursive: true });
  await fs.mkdir(path.dirname(markdownPath), { recursive: true });
  await fs.writeFile(jsonPath, JSON.stringify(state, null, 2) + "\n", "utf-8");
  await fs.writeFile(markdownPath, buildContinuityMarkdown(state), "utf-8");
  return state;
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
