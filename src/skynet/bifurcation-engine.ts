import fs from "node:fs/promises";
import path from "node:path";

export type SkynetBifurcationEvent = {
  timestamp: number;
  label: string;
  contextSnapshot: string;
  options: string[];
  selected: string;
  stabilized: boolean;
};

export type SkynetBifurcationState = {
  sessionKey: string;
  updatedAt: number;
  activeBifurcation?: SkynetBifurcationEvent;
  history: SkynetBifurcationEvent[];
};

function sanitizeSessionKey(sessionKey: string): string {
  return (sessionKey.trim() || "main").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 64) || "main";
}

function resolveBifurcationJsonPath(params: { workspaceRoot: string; sessionKey: string }): string {
  return path.join(
    params.workspaceRoot,
    ".openskynet",
    "skynet-bifurcation",
    `${sanitizeSessionKey(params.sessionKey)}.json`,
  );
}

function resolveBifurcationMarkdownPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, "memory", "SKYNET_BIFURCATION.md");
}

export async function loadSkynetBifurcationState(params: {
  workspaceRoot: string;
  sessionKey: string;
}): Promise<SkynetBifurcationState> {
  const jsonPath = resolveBifurcationJsonPath(params);
  try {
    const data = await fs.readFile(jsonPath, "utf-8");
    return JSON.parse(data);
  } catch {
    return {
      sessionKey: params.sessionKey,
      updatedAt: Date.now(),
      history: [],
    };
  }
}

export async function saveSkynetBifurcationState(params: {
  workspaceRoot: string;
  state: SkynetBifurcationState;
}): Promise<void> {
  const jsonPath = resolveBifurcationJsonPath({
    workspaceRoot: params.workspaceRoot,
    sessionKey: params.state.sessionKey,
  });
  const markdownPath = resolveBifurcationMarkdownPath(params.workspaceRoot);
  await fs.mkdir(path.dirname(jsonPath), { recursive: true });
  await fs.writeFile(jsonPath, JSON.stringify(params.state, null, 2) + "\n", "utf-8");
  await fs.writeFile(markdownPath, buildBifurcationMarkdown(params.state), "utf-8");
}

export async function recordSkynetBifurcation(params: {
  workspaceRoot: string;
  sessionKey: string;
  label: string;
  contextSnapshot: string;
  options: string[];
  selected: string;
}): Promise<SkynetBifurcationEvent> {
  const state = await loadSkynetBifurcationState(params);
  const event: SkynetBifurcationEvent = {
    timestamp: Date.now(),
    label: params.label,
    contextSnapshot: params.contextSnapshot,
    options: params.options,
    selected: params.selected,
    stabilized: false,
  };
  state.activeBifurcation = event;
  state.updatedAt = Date.now();
  await saveSkynetBifurcationState({ workspaceRoot: params.workspaceRoot, state });
  return event;
}

export async function stabilizeSkynetBifurcation(params: {
  workspaceRoot: string;
  sessionKey: string;
}): Promise<void> {
  const state = await loadSkynetBifurcationState(params);
  if (state.activeBifurcation) {
    state.activeBifurcation.stabilized = true;
    state.history.push(state.activeBifurcation);
    state.activeBifurcation = undefined;
    state.updatedAt = Date.now();
    await saveSkynetBifurcationState({ workspaceRoot: params.workspaceRoot, state });
  }
}

function buildBifurcationMarkdown(state: SkynetBifurcationState): string {
  const lines = [
    "# SKYNET Bifurcation",
    "",
    `Actualizado: ${new Date(state.updatedAt).toISOString()}`,
    `Sesion: ${state.sessionKey}`,
    "",
  ];

  if (state.activeBifurcation) {
    lines.push("## Bifurcación Activa");
    lines.push("");
    lines.push(`- **Label**: ${state.activeBifurcation.label}`);
    lines.push(`- **Contexto**: ${state.activeBifurcation.contextSnapshot}`);
    lines.push(`- **Opciones**: ${state.activeBifurcation.options.join(" | ")}`);
    lines.push(`- **Seleccionada**: ${state.activeBifurcation.selected}`);
    lines.push("");
  }

  if (state.history.length > 0) {
    lines.push("## Historial");
    lines.push("");
    state.history
      .slice(-10)
      .reverse()
      .forEach((event) => {
        lines.push(`### ${event.label} (${new Date(event.timestamp).toISOString()})`);
        lines.push(`- Contexto: ${event.contextSnapshot}`);
        lines.push(`- Seleccionada: **${event.selected}**`);
        lines.push("");
      });
  }

  return lines.join("\n").trim() + "\n";
}

export function formatSkynetBifurcationBlock(state?: SkynetBifurcationState): string[] {
  if (!state || (!state.activeBifurcation && state.history.length === 0)) {
    return [];
  }
  const lines = ["", "[Skynet Bifurcation]"];
  if (state.activeBifurcation) {
    lines.push(`Active: ${state.activeBifurcation.label} -> ${state.activeBifurcation.selected}`);
  } else if (state.history.length > 0) {
    const last = state.history[state.history.length - 1]!;
    lines.push(`Last stabilized: ${last.label} -> ${last.selected}`);
  }
  return lines;
}
