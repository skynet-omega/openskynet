import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { loadOmegaDurableMemory } from "./durable-memory.js";
import {
  observeOmegaExecutiveState,
  type OmegaExecutiveObserverSnapshot,
} from "./executive-arbitration.js";
import {
  deriveOmegaExecutiveDispatchPlan,
  deriveNextOmegaExecutiveDispatchAccounting,
  type OmegaExecutiveDispatchAccounting,
  type OmegaExecutiveDispatchPlan,
} from "./executive-runtime.js";
import {
  summarizeOmegaMemoryOrchestration,
  type OmegaMemoryOrchestratorSummary,
} from "./memory-orchestrator.js";
import { loadOmegaOperationalMemory } from "./operational-memory.js";
import type { OmegaSessionAuthority } from "./session-context.js";
import { withOmegaSessionLock } from "./state-lock.js";
import { loadOmegaWorldModelSnapshot, type OmegaWorldModelSnapshot } from "./world-model.js";

export type OmegaExecutiveState = {
  sessionKey: string;
  revision?: number;
  updatedAt: number;
  syncFingerprint?: string;
  sourceSessionAuthority?: OmegaSessionAuthority;
  sourceWorldSnapshot?: OmegaWorldModelSnapshot;
  observer: OmegaExecutiveObserverSnapshot;
  memory: OmegaMemoryOrchestratorSummary;
  runtime: {
    lastSyncedAt: number;
    dispatchPlan: OmegaExecutiveDispatchPlan;
    dispatchAccounting: OmegaExecutiveDispatchAccounting;
  };
};

function sanitizeSessionKey(sessionKey: string): string {
  const normalized = sessionKey.trim() || "main";
  const readable = normalized.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 48) || "main";
  const digest = crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 12);
  return `${readable}-${digest}.json`;
}

function resolveOmegaExecutiveStateDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".openskynet", "omega-executive-state");
}

export function resolveOmegaExecutiveStateFile(params: {
  workspaceRoot: string;
  sessionKey: string;
}): string {
  return path.join(
    resolveOmegaExecutiveStateDir(params.workspaceRoot),
    sanitizeSessionKey(params.sessionKey),
  );
}

async function readOmegaExecutiveStateFile(params: {
  workspaceRoot: string;
  sessionKey: string;
}): Promise<OmegaExecutiveState | undefined> {
  try {
    const raw = await fs.readFile(resolveOmegaExecutiveStateFile(params), "utf-8");
    return JSON.parse(raw) as OmegaExecutiveState;
  } catch {
    return undefined;
  }
}

export async function loadOmegaExecutiveState(params: {
  workspaceRoot: string;
  sessionKey: string;
}): Promise<OmegaExecutiveState | undefined> {
  const existing = await readOmegaExecutiveStateFile(params);
  if (existing) {
    return existing;
  }
  return await syncOmegaExecutiveObserverState(params);
}

function buildExecutiveSyncFingerprint(params: {
  snapshot: Awaited<ReturnType<typeof loadOmegaWorldModelSnapshot>>;
  memory: OmegaMemoryOrchestratorSummary;
}): string {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        kernelUpdatedAt: params.snapshot.kernel?.updatedAt ?? 0,
        activeGoalTask: params.snapshot.activeGoalTask,
        timelineLength: params.snapshot.timelineLength,
        selfStateUpdatedAt: params.snapshot.selfState?.updatedAt ?? 0,
        activeRecoveryPreference: params.snapshot.activeRecoveryPreference,
        generalizedRecoveryPreference: params.snapshot.generalizedRecoveryPreference,
        problemAgenda: params.snapshot.problemAgenda.map((item) => ({
          classKey: item.classKey,
          status: item.status,
          priority: item.priority,
          realizedUtility: item.realizedUtility,
          activationCount: item.activationCount,
          successCount: item.successCount,
          failureCount: item.failureCount,
        })),
        memory: params.memory,
      }),
    )
    .digest("hex");
}

export async function syncOmegaExecutiveObserverState(
  params: {
    workspaceRoot: string;
    sessionKey: string;
  },
  skipHeavySync?: boolean,
): Promise<OmegaExecutiveState> {
  const existing = await readOmegaExecutiveStateFile(params);
  if (skipHeavySync && existing) {
    return existing;
  }
  const snapshot = await loadOmegaWorldModelSnapshot(params);
  const durableMemory = await loadOmegaDurableMemory(params);
  const operationalSignals = await loadOmegaOperationalMemory(params);
  const memory = summarizeOmegaMemoryOrchestration({
    durableMemory,
    operationalSignals,
  });
  const syncFingerprint = buildExecutiveSyncFingerprint({ snapshot, memory });

  let nextState: OmegaExecutiveState | undefined;
  await withOmegaSessionLock(params, async () => {
    const existing = await readOmegaExecutiveStateFile(params);
    if (existing?.syncFingerprint === syncFingerprint) {
      nextState = existing;
      return;
    }
    const observer = observeOmegaExecutiveState({
      snapshot,
      memory,
    });
    const dispatchPlan = deriveOmegaExecutiveDispatchPlan({
      observer,
      previousAccounting: existing?.runtime.dispatchAccounting,
    });
    const dispatchAccounting = deriveNextOmegaExecutiveDispatchAccounting({
      previousAccounting: existing?.runtime.dispatchAccounting,
      plan: dispatchPlan,
    });
    const now = Date.now();
    nextState = {
      sessionKey: params.sessionKey,
      revision: (existing?.revision ?? 0) + 1,
      updatedAt: now,
      syncFingerprint,
      sourceSessionAuthority: {
        timeline: snapshot.sessionAuthority.timeline,
        state: snapshot.sessionAuthority.state,
        kernel: snapshot.sessionAuthority.kernel,
        transactions: snapshot.sessionAuthority.transactions,
      },
      sourceWorldSnapshot: snapshot,
      observer,
      memory,
      runtime: {
        lastSyncedAt: now,
        dispatchPlan,
        dispatchAccounting,
      },
    };
    await fs.mkdir(resolveOmegaExecutiveStateDir(params.workspaceRoot), { recursive: true });
    await fs.writeFile(
      resolveOmegaExecutiveStateFile(params),
      `${JSON.stringify(nextState, null, 2)}\n`,
      "utf-8",
    );
  });

  return nextState as OmegaExecutiveState;
}
