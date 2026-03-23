import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  OmegaSessionOutcomeSnapshot,
  OmegaSessionValidationSnapshot,
} from "./session-context.js";
import { withOmegaSessionLock } from "./state-lock.js";

export type OmegaDurableMemoryKind = "verified_success" | "repeated_failure";

export type OmegaDurableMemoryEntry = {
  id: string;
  kind: OmegaDurableMemoryKind;
  task: string;
  targets: string[];
  errorKind?: string;
  observedChangedFiles: string[];
  structuredOk?: boolean;
  writeOk?: boolean;
  localityScore?: number;
  protectedPreservationRate?: number;
  successCount: number;
  failureCount: number;
  learnedConstraints: string[];
  firstSeenAt: number;
  lastSeenAt: number;
  lastOutcomeStatus: OmegaSessionOutcomeSnapshot["status"];
};

type OmegaDurableMemoryStore = {
  sessionKey: string;
  revision?: number;
  updatedAt: number;
  entries: OmegaDurableMemoryEntry[];
};

const OMEGA_DURABLE_MEMORY_LIMIT = 48;

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizePaths(values: string[]): string[] {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter((value) => value.length > 0)),
  ).sort();
}

function normalizeUnitInterval(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.max(0, Math.min(1, value));
}

function durableMemoryId(task: string, targets: string[], errorKind?: string): string {
  return crypto
    .createHash("sha256")
    .update(`${normalizeText(task)}::${normalizePaths(targets).join("|")}::${errorKind ?? ""}`)
    .digest("hex")
    .slice(0, 16);
}

function sanitizeSessionKey(sessionKey: string): string {
  const normalized = sessionKey.trim() || "main";
  const readable = normalized.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 48) || "main";
  const digest = crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 12);
  return `${readable}-${digest}.json`;
}

function resolveOmegaDurableMemoryDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".openskynet", "omega-durable-memory");
}

export function resolveOmegaDurableMemoryFile(params: {
  workspaceRoot: string;
  sessionKey: string;
}): string {
  // Durable Memory is shared across all sessions in the workspace to enable cross-session learning.
  return path.join(
    resolveOmegaDurableMemoryDir(params.workspaceRoot),
    "global-durable-memory.json",
  );
}

function parseDurableMemoryEntry(value: unknown): OmegaDurableMemoryEntry | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const entry = value as Partial<OmegaDurableMemoryEntry>;
  if (
    typeof entry.id !== "string" ||
    typeof entry.kind !== "string" ||
    typeof entry.task !== "string" ||
    typeof entry.firstSeenAt !== "number" ||
    typeof entry.lastSeenAt !== "number" ||
    typeof entry.lastOutcomeStatus !== "string"
  ) {
    return undefined;
  }
  if (entry.kind !== "verified_success" && entry.kind !== "repeated_failure") {
    return undefined;
  }
  return {
    id: entry.id,
    kind: entry.kind,
    task: entry.task,
    targets: Array.isArray(entry.targets)
      ? normalizePaths(entry.targets.filter((v): v is string => typeof v === "string"))
      : [],
    errorKind: typeof entry.errorKind === "string" ? entry.errorKind : undefined,
    observedChangedFiles: Array.isArray(entry.observedChangedFiles)
      ? normalizePaths(entry.observedChangedFiles.filter((v): v is string => typeof v === "string"))
      : [],
    structuredOk: typeof entry.structuredOk === "boolean" ? entry.structuredOk : undefined,
    writeOk: typeof entry.writeOk === "boolean" ? entry.writeOk : undefined,
    localityScore: normalizeUnitInterval(entry.localityScore),
    protectedPreservationRate: normalizeUnitInterval(entry.protectedPreservationRate),
    successCount: typeof entry.successCount === "number" ? entry.successCount : 0,
    failureCount: typeof entry.failureCount === "number" ? entry.failureCount : 0,
    learnedConstraints: Array.isArray(entry.learnedConstraints)
      ? entry.learnedConstraints.filter((v): v is string => typeof v === "string")
      : [],
    firstSeenAt: entry.firstSeenAt,
    lastSeenAt: entry.lastSeenAt,
    lastOutcomeStatus: entry.lastOutcomeStatus,
  };
}

export async function loadOmegaDurableMemory(params: {
  workspaceRoot: string;
  sessionKey: string;
}): Promise<OmegaDurableMemoryEntry[]> {
  try {
    const raw = await fs.readFile(resolveOmegaDurableMemoryFile(params), "utf-8");
    const parsed = JSON.parse(raw) as Partial<OmegaDurableMemoryStore>;
    if (!Array.isArray(parsed.entries)) {
      return [];
    }
    return parsed.entries
      .map(parseDurableMemoryEntry)
      .filter((value): value is OmegaDurableMemoryEntry => value !== undefined);
  } catch {
    return [];
  }
}

function queryScore(entry: OmegaDurableMemoryEntry, task: string, expectedPaths: string[]): number {
  const normalizedTask = normalizeText(task);
  const tokens = normalizedTask.split(/[^a-z0-9]+/i).filter((token) => token.length >= 4);
  const normalizedTargets = normalizePaths(expectedPaths).map((value) => normalizeText(value));
  let score = 0;

  if (
    normalizeText(entry.task).includes(normalizedTask) ||
    normalizedTask.includes(normalizeText(entry.task))
  ) {
    score += 5;
  }
  for (const token of tokens) {
    if (normalizeText(entry.task).includes(token)) {
      score += 2;
    }
    if (entry.targets.some((target) => normalizeText(target).includes(token))) {
      score += 2;
    }
  }
  if (normalizedTargets.length > 0) {
    for (const target of normalizedTargets) {
      if (entry.targets.some((candidate) => normalizeText(candidate) === target)) {
        score += 4;
      }
    }
  }
  if (entry.kind === "verified_success") {
    score += Math.min(entry.successCount, 3);
    if (typeof entry.localityScore === "number" && entry.localityScore >= 0.8) {
      score += 1;
    }
    if (
      typeof entry.protectedPreservationRate === "number" &&
      entry.protectedPreservationRate >= 0.9
    ) {
      score += 1;
    }
  } else {
    score += Math.min(entry.failureCount, 3);
    if (
      typeof entry.localityScore === "number" &&
      entry.localityScore < 0.5 &&
      typeof entry.protectedPreservationRate === "number" &&
      entry.protectedPreservationRate < 0.75
    ) {
      score += 2;
    }
  }
  return score;
}

export async function queryOmegaDurableMemory(params: {
  workspaceRoot: string;
  sessionKey: string;
  task: string;
  expectedPaths?: string[];
  maxResults?: number;
}): Promise<OmegaDurableMemoryEntry[]> {
  const entries = await loadOmegaDurableMemory(params);
  const scored = entries
    .filter((entry) => entry.kind !== "repeated_failure" || entry.failureCount >= 1)
    .map((entry) => ({
      entry,
      score: queryScore(entry, params.task, params.expectedPaths ?? []),
    }))
    .filter((item) => item.score > 0)
    .sort(
      (left, right) => right.score - left.score || right.entry.lastSeenAt - left.entry.lastSeenAt,
    );
  return scored.slice(0, params.maxResults ?? 4).map((item) => item.entry);
}

export async function admitOmegaDurableMemory(params: {
  workspaceRoot: string;
  sessionKey: string;
  task: string;
  learnedConstraints?: string[];
  validation: OmegaSessionValidationSnapshot;
  outcome: OmegaSessionOutcomeSnapshot;
}): Promise<void> {
  await withOmegaSessionLock(params, async () => {
    const targets = normalizePaths([
      ...(params.validation.expectedPaths ?? []),
      ...(params.outcome.observedChangedFiles ?? []),
    ]);
    const existing = await loadOmegaDurableMemory(params);
    let currentRevision = 0;
    try {
      const raw = await fs.readFile(resolveOmegaDurableMemoryFile(params), "utf-8");
      const parsed = JSON.parse(raw) as Partial<OmegaDurableMemoryStore>;
      currentRevision = typeof parsed.revision === "number" ? parsed.revision : 0;
    } catch {}
    const id = durableMemoryId(params.task, targets, params.outcome.errorKind);
    const now = Date.now();
    const index = existing.findIndex((entry) => entry.id === id);
    const current = index >= 0 ? existing[index] : undefined;

    const verifiedSuccess =
      params.outcome.status === "ok" &&
      (params.outcome.writeOk === true ||
        params.outcome.structuredOk === true ||
        (params.outcome.observedChangedFiles?.length ?? 0) > 0);

    const repeatedFailure =
      params.outcome.status !== "ok" &&
      typeof params.outcome.errorKind === "string" &&
      (current?.failureCount ?? 0) + 1 >= 1;

    const learnedConstraints = Array.from(
      new Set([...(current?.learnedConstraints ?? []), ...(params.learnedConstraints ?? [])]),
    );

    if (!verifiedSuccess && !repeatedFailure) {
      if (params.outcome.status !== "ok" && typeof params.outcome.errorKind === "string") {
        const nextFailureEntry: OmegaDurableMemoryEntry = current
          ? {
              ...current,
              failureCount: current.failureCount + 1,
              learnedConstraints,
              lastSeenAt: now,
              lastOutcomeStatus: params.outcome.status,
            }
          : {
              id,
              kind: "repeated_failure",
              task: params.task,
              targets,
              errorKind: params.outcome.errorKind,
              observedChangedFiles: normalizePaths(params.outcome.observedChangedFiles ?? []),
              structuredOk: params.outcome.structuredOk,
              writeOk: params.outcome.writeOk,
              localityScore: normalizeUnitInterval(params.outcome.localityScore),
              protectedPreservationRate: normalizeUnitInterval(
                params.outcome.protectedPreservationRate,
              ),
              successCount: 0,
              failureCount: 1,
              learnedConstraints,
              firstSeenAt: now,
              lastSeenAt: now,
              lastOutcomeStatus: params.outcome.status,
            };
        if (index >= 0) {
          existing[index] = nextFailureEntry;
        } else {
          existing.push(nextFailureEntry);
        }
      }
    } else {
      const next: OmegaDurableMemoryEntry = {
        id,
        kind: verifiedSuccess ? "verified_success" : "repeated_failure",
        task: params.task,
        targets,
        errorKind: params.outcome.errorKind,
        observedChangedFiles: normalizePaths(
          params.outcome.observedChangedFiles ?? current?.observedChangedFiles ?? [],
        ),
        structuredOk: params.outcome.structuredOk ?? current?.structuredOk,
        writeOk: params.outcome.writeOk ?? current?.writeOk,
        localityScore:
          normalizeUnitInterval(params.outcome.localityScore) ?? current?.localityScore,
        protectedPreservationRate:
          normalizeUnitInterval(params.outcome.protectedPreservationRate) ??
          current?.protectedPreservationRate,
        successCount: (current?.successCount ?? 0) + (verifiedSuccess ? 1 : 0),
        failureCount: (current?.failureCount ?? 0) + (!verifiedSuccess ? 1 : 0),
        learnedConstraints,
        firstSeenAt: current?.firstSeenAt ?? now,
        lastSeenAt: now,
        lastOutcomeStatus: params.outcome.status,
      };
      if (index >= 0) {
        existing[index] = next;
      } else {
        existing.push(next);
      }
    }

    const trimmed = existing
      .sort((left, right) => right.lastSeenAt - left.lastSeenAt)
      .slice(0, OMEGA_DURABLE_MEMORY_LIMIT);
    const payload: OmegaDurableMemoryStore = {
      sessionKey: params.sessionKey,
      revision: currentRevision + 1,
      updatedAt: now,
      entries: trimmed,
    };
    await fs.mkdir(resolveOmegaDurableMemoryDir(params.workspaceRoot), { recursive: true });
    await fs.writeFile(
      resolveOmegaDurableMemoryFile(params),
      JSON.stringify(payload, null, 2),
      "utf-8",
    );
  });
}
