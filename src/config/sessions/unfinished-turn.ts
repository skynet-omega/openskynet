import crypto from "node:crypto";
import { normalizeInterruptedTurnMessage } from "../../sessions/interrupted-turn.js";
import { updateSessionStore, updateSessionStoreEntry } from "./store.js";
import type { SessionEntry, SessionInterruptedTurn, SessionUnfinishedTurn } from "./types.js";

const UNFINISHED_TURN_PREVIEW_MAX_CHARS = 240;
export const MAX_INTERRUPTED_RESUME_COUNT = 3;
export const MAX_RATE_LIMIT_INTERRUPTED_RESUME_COUNT = 4;

function normalizeUnfinishedTurnPreview(text: string): string | undefined {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (!collapsed) {
    return undefined;
  }
  if (collapsed.length <= UNFINISHED_TURN_PREVIEW_MAX_CHARS) {
    return collapsed;
  }
  return `${collapsed.slice(0, UNFINISHED_TURN_PREVIEW_MAX_CHARS - 1).trimEnd()}…`;
}

export function buildUnfinishedTurnHint(
  turn: SessionUnfinishedTurn | undefined,
): string | undefined {
  if (!turn) {
    return undefined;
  }
  const preview = turn.promptPreview?.trim();
  const suffix = preview ? ` Last unfinished user request: ${JSON.stringify(preview)}` : "";
  return (
    "Note: The previous agent turn appears to have ended before a visible final reply. " +
    `Resume the interrupted work if it is still relevant.${suffix}`
  );
}

export async function markSessionUnfinishedTurn(params: {
  sessionId: string;
  sessionKey?: string;
  sessionStore?: Record<string, SessionEntry>;
  storePath?: string;
  prompt: string;
  turnId?: string;
  messageChannel?: string;
  channel?: string;
  to?: string;
  accountId?: string;
  threadId?: string | number;
  senderIsOwner?: boolean;
}): Promise<SessionUnfinishedTurn | undefined> {
  const { sessionId, sessionKey, sessionStore, storePath } = params;
  if (!sessionKey || !sessionStore || !storePath) {
    return undefined;
  }
  const existing = sessionStore[sessionKey];
  const resumeCount = existing?.interruptedTurn?.resumeCount;
  const lastResumeAt = existing?.interruptedTurn?.lastResumeAt;
  const unfinishedTurn: SessionUnfinishedTurn = {
    turnId: params.turnId?.trim() || crypto.randomUUID(),
    sessionId,
    startedAt: Date.now(),
    promptPreview: normalizeUnfinishedTurnPreview(params.prompt),
    messageChannel: params.messageChannel?.trim() || undefined,
    channel: params.channel?.trim() || undefined,
    to: params.to?.trim() || undefined,
    accountId: params.accountId?.trim() || undefined,
    threadId: params.threadId,
    senderIsOwner: params.senderIsOwner,
    resumeCount,
    lastResumeAt,
  };
  const interruptedTurn: SessionInterruptedTurn = {
    runId: unfinishedTurn.turnId,
    message: normalizeInterruptedTurnMessage(params.prompt),
    startedAt: unfinishedTurn.startedAt,
    messageChannel: unfinishedTurn.messageChannel,
    channel: unfinishedTurn.channel,
    to: unfinishedTurn.to,
    accountId: unfinishedTurn.accountId,
    threadId: unfinishedTurn.threadId,
    senderIsOwner: unfinishedTurn.senderIsOwner,
    resumeCount,
    lastResumeAt,
  };
  const persisted = await updateSessionStore(storePath, (store) => {
    const current = store[sessionKey] ?? sessionStore[sessionKey] ?? { sessionId, updatedAt: 0 };
    store[sessionKey] = {
      ...current,
      sessionId,
      updatedAt: Date.now(),
      unfinishedTurn,
      interruptedTurn,
    };
    return store[sessionKey];
  });
  sessionStore[sessionKey] = persisted;
  return unfinishedTurn;
}

export function canAttemptInterruptedResume(
  entry: SessionEntry | undefined,
  options?: {
    maxResumeCount?: number;
  },
): boolean {
  const resumeCount = entry?.interruptedTurn?.resumeCount ?? 0;
  const maxResumeCount =
    typeof options?.maxResumeCount === "number" && Number.isFinite(options.maxResumeCount)
      ? Math.max(1, Math.floor(options.maxResumeCount))
      : MAX_INTERRUPTED_RESUME_COUNT;
  return resumeCount < maxResumeCount;
}

export async function markSessionInterruptedResumeAttempt(params: {
  sessionKey?: string;
  sessionStore?: Record<string, SessionEntry>;
  storePath?: string;
}): Promise<SessionEntry | undefined> {
  const { sessionKey, sessionStore, storePath } = params;
  if (!sessionKey || !storePath) {
    return undefined;
  }
  const persisted = await updateSessionStoreEntry({
    storePath,
    sessionKey,
    update: async (entry) => {
      if (!entry.interruptedTurn && !entry.unfinishedTurn) {
        return null;
      }
      const nextResumeCount = (entry.interruptedTurn?.resumeCount ?? 0) + 1;
      const lastResumeAt = Date.now();
      return {
        interruptedTurn: entry.interruptedTurn
          ? {
              ...entry.interruptedTurn,
              resumeCount: nextResumeCount,
              lastResumeAt,
            }
          : undefined,
        unfinishedTurn: entry.unfinishedTurn
          ? {
              ...entry.unfinishedTurn,
              resumeCount: nextResumeCount,
              lastResumeAt,
            }
          : undefined,
        updatedAt: lastResumeAt,
      };
    },
  });
  if (persisted && sessionStore) {
    sessionStore[sessionKey] = persisted;
  }
  return persisted ?? undefined;
}

export async function clearSessionUnfinishedTurn(params: {
  sessionKey?: string;
  sessionStore?: Record<string, SessionEntry>;
  storePath?: string;
}): Promise<void> {
  const { sessionKey, sessionStore, storePath } = params;
  if (!sessionKey || !storePath) {
    return;
  }
  const persisted = await updateSessionStoreEntry({
    storePath,
    sessionKey,
    update: async (entry) => {
      if (!entry.unfinishedTurn && !entry.interruptedTurn) {
        return null;
      }
      return {
        unfinishedTurn: undefined,
        interruptedTurn: undefined,
        updatedAt: Date.now(),
      };
    },
  });
  if (persisted && sessionStore) {
    sessionStore[sessionKey] = persisted;
  }
}
