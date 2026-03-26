import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { writeJsonAtomic } from "../infra/json-files.js";
import type { OmegaHeartbeatTurnResult } from "./heartbeat.js";
import type { OmegaHeartbeatTurnPolicy } from "./policy-engine.js";
import { withOmegaSessionLock } from "./state-lock.js";

export type OmegaOperationalTurnMemoryEntry = {
  id: string;
  recordedAt: number;
  iteration: number;
  terminationReason: OmegaHeartbeatTurnResult["terminationReason"];
  turnHealth: OmegaHeartbeatTurnPolicy["turnHealth"];
  progressObserved: boolean;
  timelineDelta: number;
  kernelUpdated: boolean;
  latencyBreakdown: OmegaHeartbeatTurnResult["latencyBreakdown"];
  /** Causal impact score (0-1). 1 = verified disk delta or contract success. */
  causalImpact?: number;
};

export type OmegaOperationalMemorySummary = {
  recentTurnCount: number;
  recentStalledTurns: number;
  recentResolvedTurns: number;
  latestTurnHealth?: OmegaHeartbeatTurnPolicy["turnHealth"];
  /** Average causal impact of recent turns (0-1). */
  averageCausalImpact: number;
  /** Causal impact of the single most recent turn (0-1). */
  latestCausalImpact: number;
};

type OmegaOperationalMemoryStore = {
  sessionKey: string;
  revision?: number;
  updatedAt: number;
  entries: OmegaOperationalTurnMemoryEntry[];
};

const OMEGA_OPERATIONAL_MEMORY_LIMIT = 12;

function sanitizeSessionKey(sessionKey: string): string {
  const normalized = sessionKey.trim() || "main";
  const readable = normalized.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 48) || "main";
  const digest = crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 12);
  return `${readable}-${digest}.json`;
}

function resolveOmegaOperationalMemoryDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".openskynet", "omega-operational-memory");
}

export function resolveOmegaOperationalMemoryFile(params: {
  workspaceRoot: string;
  sessionKey: string;
}): string {
  return path.join(
    resolveOmegaOperationalMemoryDir(params.workspaceRoot),
    sanitizeSessionKey(params.sessionKey),
  );
}

function parseEntry(value: unknown): OmegaOperationalTurnMemoryEntry | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const entry = value as Partial<OmegaOperationalTurnMemoryEntry>;
  if (
    typeof entry.id !== "string" ||
    typeof entry.recordedAt !== "number" ||
    typeof entry.iteration !== "number" ||
    typeof entry.terminationReason !== "string" ||
    typeof entry.turnHealth !== "string" ||
    typeof entry.progressObserved !== "boolean" ||
    typeof entry.timelineDelta !== "number" ||
    typeof entry.kernelUpdated !== "boolean" ||
    !entry.latencyBreakdown ||
    typeof entry.latencyBreakdown !== "object"
  ) {
    return undefined;
  }
  const latency = entry.latencyBreakdown as OmegaHeartbeatTurnResult["latencyBreakdown"];
  return {
    id: entry.id,
    recordedAt: entry.recordedAt,
    iteration: entry.iteration,
    terminationReason: entry.terminationReason,
    turnHealth: entry.turnHealth,
    progressObserved: entry.progressObserved,
    timelineDelta: entry.timelineDelta,
    kernelUpdated: entry.kernelUpdated,
    latencyBreakdown: {
      sendAgentTurnMs: typeof latency.sendAgentTurnMs === "number" ? latency.sendAgentTurnMs : 0,
      loadSnapshotMs: typeof latency.loadSnapshotMs === "number" ? latency.loadSnapshotMs : 0,
      readLatestReplyMs:
        typeof latency.readLatestReplyMs === "number" ? latency.readLatestReplyMs : 0,
      totalMs: typeof latency.totalMs === "number" ? latency.totalMs : 0,
    },
    causalImpact: typeof entry.causalImpact === "number" ? entry.causalImpact : 0,
  };
}

function parseOperationalStore(raw: string): OmegaOperationalMemoryStore {
  const parsed = JSON.parse(raw) as Partial<OmegaOperationalMemoryStore>;
  return {
    sessionKey: typeof parsed.sessionKey === "string" ? parsed.sessionKey : "main",
    revision: typeof parsed.revision === "number" ? parsed.revision : 0,
    updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
    entries: Array.isArray(parsed.entries)
      ? parsed.entries
          .map(parseEntry)
          .filter((value): value is OmegaOperationalTurnMemoryEntry => value !== undefined)
      : [],
  };
}

export async function loadOmegaOperationalMemory(params: {
  workspaceRoot: string;
  sessionKey: string;
}): Promise<OmegaOperationalTurnMemoryEntry[]> {
  try {
    const raw = await fs.readFile(resolveOmegaOperationalMemoryFile(params), "utf-8");
    return parseOperationalStore(raw).entries;
  } catch {
    return [];
  }
}

export function summarizeOmegaOperationalMemory(
  entries: OmegaOperationalTurnMemoryEntry[],
): OmegaOperationalMemorySummary {
  const recent = entries.slice(-5);
  const totalImpact = recent.reduce((sum, entry) => sum + (entry.causalImpact ?? 0), 0);
  return {
    recentTurnCount: recent.length,
    recentStalledTurns: recent.filter((entry) => entry.turnHealth === "stalled").length,
    recentResolvedTurns: recent.filter((entry) => entry.turnHealth === "resolved").length,
    latestTurnHealth: recent.at(-1)?.turnHealth,
    averageCausalImpact: recent.length > 0 ? totalImpact / recent.length : 0,
    latestCausalImpact: recent.at(-1)?.causalImpact ?? 0,
  };
}

export async function loadOmegaOperationalMemorySummary(params: {
  workspaceRoot: string;
  sessionKey: string;
}): Promise<OmegaOperationalMemorySummary> {
  return summarizeOmegaOperationalMemory(await loadOmegaOperationalMemoryTail(params));
}

/**
 * Loads only the last 5 turns from the operational memory to reduce I/O and parse time.
 */
export async function loadOmegaOperationalMemoryTail(params: {
  workspaceRoot: string;
  sessionKey: string;
  tailSize?: number;
}): Promise<OmegaOperationalTurnMemoryEntry[]> {
  const full = await loadOmegaOperationalMemory(params);
  return full.slice(-(params.tailSize ?? 5));
}

export async function recordOmegaOperationalTurnMemory(params: {
  workspaceRoot: string;
  sessionKey: string;
  turn: Pick<
    OmegaHeartbeatTurnResult,
    "iteration" | "terminationReason" | "decision" | "stateDelta" | "latencyBreakdown"
  >;
  turnPolicy?: Pick<
    ReturnType<typeof import("./policy-engine.js").deriveOmegaHeartbeatTurnPolicy>,
    "shouldBackoff" | "turnHealth"
  >;
}): Promise<void> {
  const fallbackTurnHealth = params.turn.stateDelta.progressObserved ? "progressing" : "stalled";
  return recordOmegaOperationalTurnMemoryBatch({
    workspaceRoot: params.workspaceRoot,
    sessionKey: params.sessionKey,
    turns: [
      {
        turn: params.turn,
        turnPolicy: params.turnPolicy ?? { turnHealth: fallbackTurnHealth },
      },
    ],
  });
}

export async function recordOmegaOperationalTurnMemoryBatch(params: {
  workspaceRoot: string;
  sessionKey: string;
  turns: Array<{
    turn: Pick<
      OmegaHeartbeatTurnResult,
      "iteration" | "terminationReason" | "stateDelta" | "latencyBreakdown"
    >;
    turnPolicy: Pick<OmegaHeartbeatTurnPolicy, "turnHealth">;
  }>;
}): Promise<void> {
  if (params.turns.length === 0) return;
  await withOmegaSessionLock(params, async () => {
    let existing: OmegaOperationalTurnMemoryEntry[] = [];
    let currentRevision = 0;
    try {
      const raw = await fs.readFile(resolveOmegaOperationalMemoryFile(params), "utf-8");
      const parsed = parseOperationalStore(raw);
      existing = parsed.entries;
      currentRevision = parsed.revision ?? 0;
    } catch {}
    const now = Date.now();
    const newEntries = params.turns.map(({ turn, turnPolicy }) => ({
      id: crypto
        .createHash("sha256")
        .update(`${params.sessionKey}:${turn.iteration}:${turn.terminationReason}:${now}`)
        .digest("hex")
        .slice(0, 16),
      recordedAt: now,
      iteration: turn.iteration,
      terminationReason: turn.terminationReason,
      turnHealth: turnPolicy.turnHealth,
      progressObserved: turn.stateDelta.progressObserved,
      timelineDelta: turn.stateDelta.timelineDelta,
      kernelUpdated: turn.stateDelta.kernelUpdated,
      latencyBreakdown: turn.latencyBreakdown,
      causalImpact: turn.stateDelta.progressObserved ? 1.0 : 0.0,
    }));
    const nextEntries = [...existing, ...newEntries].slice(-OMEGA_OPERATIONAL_MEMORY_LIMIT);
    await fs
      .mkdir(resolveOmegaOperationalMemoryDir(params.workspaceRoot), { recursive: true })
      .catch(() => {});
    await writeJsonAtomic(
      resolveOmegaOperationalMemoryFile(params),
      {
        sessionKey: params.sessionKey,
        revision: currentRevision + 1,
        updatedAt: now,
        entries: nextEntries,
      },
      { trailingNewline: true },
    );
  });
}
