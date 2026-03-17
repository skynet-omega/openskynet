import type { OpenClawConfig } from "../../config/config.js";
import { loadConfig } from "../../config/config.js";
import { callGateway } from "../../gateway/call.js";
import { loadCombinedSessionStoreForGateway, resolveSessionStoreKey } from "../../gateway/session-utils.js";
import {
  buildAgentMainSessionKey,
  isAcpSessionKey,
  normalizeMainKey,
  resolveAgentIdFromSessionKey,
} from "../../routing/session-key.js";
import { looksLikeSessionId } from "../../sessions/session-id.js";

function normalizeKey(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

type SessionLineageEntry = {
  spawnedBy?: unknown;
};

type SessionLineageSnapshot = {
  cfg: OpenClawConfig;
  store: Record<string, SessionLineageEntry>;
};

function loadSessionLineageSnapshot(
  cfg?: OpenClawConfig,
  store?: Record<string, SessionLineageEntry>,
): SessionLineageSnapshot {
  const resolvedCfg = cfg ?? loadConfig();
  if (store) {
    return { cfg: resolvedCfg, store };
  }
  const combined = loadCombinedSessionStoreForGateway(resolvedCfg);
  return {
    cfg: resolvedCfg,
    store: combined.store,
  };
}

function resolveCanonicalSessionLineageKey(
  snapshot: SessionLineageSnapshot,
  key: string | undefined,
): string | undefined {
  const normalized = normalizeKey(key);
  if (!normalized) {
    return undefined;
  }
  return resolveSessionStoreKey({
    cfg: snapshot.cfg,
    sessionKey: normalized,
  });
}

export function resolveSessionLineageKey(params: {
  sessionKey: string;
  cfg?: OpenClawConfig;
  store?: Record<string, SessionLineageEntry>;
}): string | undefined {
  const snapshot = loadSessionLineageSnapshot(params.cfg, params.store);
  return resolveCanonicalSessionLineageKey(snapshot, params.sessionKey);
}

export function resolveMainSessionAlias(cfg: OpenClawConfig) {
  const mainKey = normalizeMainKey(cfg.session?.mainKey);
  const scope = cfg.session?.scope ?? "per-sender";
  const alias = scope === "global" ? "global" : mainKey;
  return { mainKey, alias, scope };
}

function resolveRequesterScopedMainSessionKey(params: {
  requesterSessionKey?: string;
  mainKey: string;
}): string | undefined {
  const requesterSessionKey = normalizeKey(params.requesterSessionKey);
  if (!requesterSessionKey || !requesterSessionKey.startsWith("agent:")) {
    return undefined;
  }
  return buildAgentMainSessionKey({
    agentId: resolveAgentIdFromSessionKey(requesterSessionKey),
    mainKey: params.mainKey,
  });
}

export function resolveDisplaySessionKey(params: {
  key: string;
  alias: string;
  mainKey: string;
  requesterSessionKey?: string;
}) {
  const requesterScopedMainKey = resolveRequesterScopedMainSessionKey({
    requesterSessionKey: params.requesterSessionKey,
    mainKey: params.mainKey,
  });
  if (requesterScopedMainKey && params.key === requesterScopedMainKey) {
    return "main";
  }
  if (params.key === params.alias) {
    return "main";
  }
  if (params.key === params.mainKey) {
    return "main";
  }
  return params.key;
}

export function resolveInternalSessionKey(params: {
  key: string;
  alias: string;
  mainKey: string;
  requesterSessionKey?: string;
}) {
  if (params.key === "main" || params.key === params.mainKey) {
    const requesterScopedMainKey = resolveRequesterScopedMainSessionKey({
      requesterSessionKey: params.requesterSessionKey,
      mainKey: params.mainKey,
    });
    if (requesterScopedMainKey) {
      return requesterScopedMainKey;
    }
    return params.alias;
  }
  return params.key;
}

export async function listSpawnedSessionKeys(params: {
  requesterSessionKey: string;
  limit?: number;
  cfg?: OpenClawConfig;
  store?: Record<string, SessionLineageEntry>;
}): Promise<Set<string>> {
  const limit =
    typeof params.limit === "number" && Number.isFinite(params.limit)
      ? Math.max(1, Math.floor(params.limit))
      : 500;
  const snapshot = loadSessionLineageSnapshot(params.cfg, params.store);
  const requesterKey = resolveCanonicalSessionLineageKey(snapshot, params.requesterSessionKey);
  if (!requesterKey) {
    return new Set();
  }
  const childrenByParent = new Map<string, string[]>();
  for (const [sessionKey, entry] of Object.entries(snapshot.store)) {
    const parentKey = resolveCanonicalSessionLineageKey(
      snapshot,
      typeof entry?.spawnedBy === "string" ? entry.spawnedBy : undefined,
    );
    if (!parentKey || sessionKey === requesterKey) {
      continue;
    }
    const children = childrenByParent.get(parentKey);
    if (children) {
      children.push(sessionKey);
      continue;
    }
    childrenByParent.set(parentKey, [sessionKey]);
  }

  const visible = new Set<string>();
  const queue = [...(childrenByParent.get(requesterKey) ?? [])];
  while (queue.length > 0 && visible.size < limit) {
    const current = queue.shift();
    if (!current || visible.has(current)) {
      continue;
    }
    visible.add(current);
    for (const child of childrenByParent.get(current) ?? []) {
      if (!visible.has(child)) {
        queue.push(child);
      }
    }
  }
  return visible;
}

export async function isRequesterSpawnedSessionVisible(params: {
  requesterSessionKey: string;
  targetSessionKey: string;
  limit?: number;
  cfg?: OpenClawConfig;
  store?: Record<string, SessionLineageEntry>;
}): Promise<boolean> {
  const targetKey = resolveSessionLineageKey({
    sessionKey: params.targetSessionKey,
    cfg: params.cfg,
    store: params.store,
  });
  if (!targetKey) {
    return false;
  }
  const requesterKey = resolveSessionLineageKey({
    sessionKey: params.requesterSessionKey,
    cfg: params.cfg,
    store: params.store,
  });
  if (requesterKey && requesterKey === targetKey) {
    return true;
  }
  const keys = await listSpawnedSessionKeys({
    requesterSessionKey: params.requesterSessionKey,
    limit: params.limit,
    cfg: params.cfg,
    store: params.store,
  });
  return keys.has(targetKey);
}

export function shouldVerifyRequesterSpawnedSessionVisibility(params: {
  requesterSessionKey: string;
  targetSessionKey: string;
  restrictToSpawned: boolean;
  resolvedViaSessionId: boolean;
}): boolean {
  return (
    params.restrictToSpawned &&
    !params.resolvedViaSessionId &&
    params.requesterSessionKey !== params.targetSessionKey
  );
}

export async function isResolvedSessionVisibleToRequester(params: {
  requesterSessionKey: string;
  targetSessionKey: string;
  restrictToSpawned: boolean;
  resolvedViaSessionId: boolean;
  limit?: number;
  cfg?: OpenClawConfig;
  store?: Record<string, SessionLineageEntry>;
}): Promise<boolean> {
  if (
    !shouldVerifyRequesterSpawnedSessionVisibility({
      requesterSessionKey: params.requesterSessionKey,
      targetSessionKey: params.targetSessionKey,
      restrictToSpawned: params.restrictToSpawned,
      resolvedViaSessionId: params.resolvedViaSessionId,
    })
  ) {
    return true;
  }
  return await isRequesterSpawnedSessionVisible({
    requesterSessionKey: params.requesterSessionKey,
    targetSessionKey: params.targetSessionKey,
    limit: params.limit,
    cfg: params.cfg,
    store: params.store,
  });
}

export { looksLikeSessionId };

export function looksLikeSessionKey(value: string): boolean {
  const raw = value.trim();
  if (!raw) {
    return false;
  }
  // These are canonical key shapes that should never be treated as sessionIds.
  if (raw === "main" || raw === "global" || raw === "unknown") {
    return true;
  }
  if (isAcpSessionKey(raw)) {
    return true;
  }
  if (raw.startsWith("agent:")) {
    return true;
  }
  if (raw.startsWith("cron:") || raw.startsWith("hook:")) {
    return true;
  }
  if (raw.startsWith("node-") || raw.startsWith("node:")) {
    return true;
  }
  if (raw.includes(":group:") || raw.includes(":channel:")) {
    return true;
  }
  return false;
}

export function shouldResolveSessionIdInput(value: string): boolean {
  // Treat anything that doesn't look like a well-formed key as a sessionId candidate.
  return looksLikeSessionId(value) || !looksLikeSessionKey(value);
}

export type SessionReferenceResolution =
  | {
      ok: true;
      key: string;
      displayKey: string;
      resolvedViaSessionId: boolean;
    }
  | { ok: false; status: "error" | "forbidden"; error: string };

export type VisibleSessionReferenceResolution =
  | {
      ok: true;
      key: string;
      displayKey: string;
    }
  | {
      ok: false;
      status: "forbidden";
      error: string;
      displayKey: string;
    };

async function resolveSessionKeyFromSessionId(params: {
  sessionId: string;
  alias: string;
  mainKey: string;
  requesterInternalKey?: string;
  restrictToSpawned: boolean;
}): Promise<SessionReferenceResolution> {
  try {
    // Resolve via gateway so we respect store routing and visibility rules.
    const result = await callGateway<{ key?: string }>({
      method: "sessions.resolve",
      params: {
        sessionId: params.sessionId,
        includeGlobal: false,
        includeUnknown: false,
      },
    });
    const key = typeof result?.key === "string" ? result.key.trim() : "";
    if (!key) {
      throw new Error(
        `Session not found: ${params.sessionId} (use the full sessionKey from sessions_list)`,
      );
    }
    return {
      ok: true,
      key,
      displayKey: resolveDisplaySessionKey({
        key,
        alias: params.alias,
        mainKey: params.mainKey,
        requesterSessionKey: params.requesterInternalKey,
      }),
      resolvedViaSessionId: true,
    };
  } catch (err) {
    if (params.restrictToSpawned) {
      return {
        ok: false,
        status: "forbidden",
        error: `Session not visible from this sandboxed agent session: ${params.sessionId}`,
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: "error",
      error:
        message ||
        `Session not found: ${params.sessionId} (use the full sessionKey from sessions_list)`,
    };
  }
}

async function resolveSessionKeyFromKey(params: {
  key: string;
  alias: string;
  mainKey: string;
  requesterInternalKey?: string;
  restrictToSpawned: boolean;
}): Promise<SessionReferenceResolution | null> {
  try {
    // Try key-based resolution first so non-standard keys keep working.
    const result = await callGateway<{ key?: string }>({
      method: "sessions.resolve",
      params: {
        key: params.key,
      },
    });
    const key = typeof result?.key === "string" ? result.key.trim() : "";
    if (!key) {
      return null;
    }
    return {
      ok: true,
      key,
      displayKey: resolveDisplaySessionKey({
        key,
        alias: params.alias,
        mainKey: params.mainKey,
        requesterSessionKey: params.requesterInternalKey,
      }),
      resolvedViaSessionId: false,
    };
  } catch {
    return null;
  }
}

export async function resolveSessionReference(params: {
  sessionKey: string;
  alias: string;
  mainKey: string;
  requesterInternalKey?: string;
  restrictToSpawned: boolean;
}): Promise<SessionReferenceResolution> {
  const raw = params.sessionKey.trim();
  if (shouldResolveSessionIdInput(raw)) {
    // Prefer key resolution to avoid misclassifying custom keys as sessionIds.
    const resolvedByKey = await resolveSessionKeyFromKey({
      key: raw,
      alias: params.alias,
      mainKey: params.mainKey,
      requesterInternalKey: params.requesterInternalKey,
      restrictToSpawned: params.restrictToSpawned,
    });
    if (resolvedByKey) {
      return resolvedByKey;
    }
    return await resolveSessionKeyFromSessionId({
      sessionId: raw,
      alias: params.alias,
      mainKey: params.mainKey,
      requesterInternalKey: params.requesterInternalKey,
      restrictToSpawned: params.restrictToSpawned,
    });
  }

  const resolvedKey = resolveInternalSessionKey({
    key: raw,
    alias: params.alias,
    mainKey: params.mainKey,
    requesterSessionKey: params.requesterInternalKey,
  });
  const displayKey = resolveDisplaySessionKey({
    key: resolvedKey,
    alias: params.alias,
    mainKey: params.mainKey,
    requesterSessionKey: params.requesterInternalKey,
  });
  return { ok: true, key: resolvedKey, displayKey, resolvedViaSessionId: false };
}

export async function resolveVisibleSessionReference(params: {
  resolvedSession: Extract<SessionReferenceResolution, { ok: true }>;
  requesterSessionKey: string;
  restrictToSpawned: boolean;
  visibilitySessionKey: string;
}): Promise<VisibleSessionReferenceResolution> {
  const resolvedKey = params.resolvedSession.key;
  const displayKey = params.resolvedSession.displayKey;
  const visible = await isResolvedSessionVisibleToRequester({
    requesterSessionKey: params.requesterSessionKey,
    targetSessionKey: resolvedKey,
    restrictToSpawned: params.restrictToSpawned,
    resolvedViaSessionId: params.resolvedSession.resolvedViaSessionId,
  });
  if (!visible) {
    return {
      ok: false,
      status: "forbidden",
      error: `Session not visible from this sandboxed agent session: ${params.visibilitySessionKey}`,
      displayKey,
    };
  }
  return { ok: true, key: resolvedKey, displayKey };
}

export function normalizeOptionalKey(value?: string) {
  return normalizeKey(value);
}
