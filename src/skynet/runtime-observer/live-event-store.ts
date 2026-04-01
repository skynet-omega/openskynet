import fs from "node:fs/promises";
import path from "node:path";
import type { SkynetRuntimeLiveObservation } from "./live-event-normalizer.js";

export type SkynetRuntimeObserverTapSummary = {
  sessionKey: string;
  updatedAt: number;
  connectedAt?: number;
  disconnectedAt?: number;
  gatewayUrl: string;
  eventCount: number;
  eventCountsByType: Record<string, number>;
  messageSubscriptions: string[];
  jsonlPath: string;
  summaryPath: string;
};

type TapLockPayload = {
  pid: number;
  startedAt: number;
};

function safeSessionKey(sessionKey: string): string {
  return (sessionKey.trim() || "main").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 64) || "main";
}

function experimentsDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".openskynet", "skynet-experiments");
}

export function resolveSkynetRuntimeObserverLiveJsonlPath(params: {
  workspaceRoot: string;
  sessionKey: string;
}): string {
  return path.join(
    experimentsDir(params.workspaceRoot),
    `${safeSessionKey(params.sessionKey)}-runtime-observer-live-01.jsonl`,
  );
}

export function resolveSkynetRuntimeObserverLiveSummaryPath(params: {
  workspaceRoot: string;
  sessionKey: string;
}): string {
  return path.join(
    experimentsDir(params.workspaceRoot),
    `${safeSessionKey(params.sessionKey)}-runtime-observer-live-01.json`,
  );
}

export function resolveSkynetRuntimeObserverLiveLockPath(params: {
  workspaceRoot: string;
  sessionKey: string;
}): string {
  return path.join(
    experimentsDir(params.workspaceRoot),
    `${safeSessionKey(params.sessionKey)}-runtime-observer-live-01.lock`,
  );
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function acquireSkynetRuntimeObserverLiveLock(params: {
  workspaceRoot: string;
  sessionKey: string;
}): Promise<string> {
  const lockPath = resolveSkynetRuntimeObserverLiveLockPath(params);
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  try {
    const existingRaw = await fs.readFile(lockPath, "utf-8");
    const existing = JSON.parse(existingRaw) as Partial<TapLockPayload>;
    if (typeof existing.pid === "number" && isProcessAlive(existing.pid)) {
      throw new Error(`runtime observer live tap already active (pid ${existing.pid})`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("already active")) {
      throw error;
    }
  }
  const payload: TapLockPayload = {
    pid: process.pid,
    startedAt: Date.now(),
  };
  await fs.writeFile(lockPath, JSON.stringify(payload, null, 2) + "\n", "utf-8");
  return lockPath;
}

export async function releaseSkynetRuntimeObserverLiveLock(lockPath: string): Promise<void> {
  try {
    await fs.unlink(lockPath);
  } catch {
    // ignore
  }
}

export async function appendSkynetRuntimeObserverLiveObservation(params: {
  workspaceRoot: string;
  sessionKey: string;
  observation: SkynetRuntimeLiveObservation;
}): Promise<string> {
  const jsonlPath = resolveSkynetRuntimeObserverLiveJsonlPath(params);
  await fs.mkdir(path.dirname(jsonlPath), { recursive: true });
  await fs.appendFile(jsonlPath, JSON.stringify(params.observation) + "\n", "utf-8");
  return jsonlPath;
}

export async function writeSkynetRuntimeObserverLiveSummary(
  summary: SkynetRuntimeObserverTapSummary,
): Promise<void> {
  await fs.mkdir(path.dirname(summary.summaryPath), { recursive: true });
  await fs.writeFile(summary.summaryPath, JSON.stringify(summary, null, 2) + "\n", "utf-8");
}
