import crypto from "node:crypto";
import path from "node:path";
import { withFileLock } from "../infra/file-lock.js";

const OMEGA_SESSION_LOCK_TIMEOUT_MS = 10_000;
const OMEGA_SESSION_LOCK_STALE_MS = 30_000;

function sanitizeSessionKey(sessionKey: string): string {
  const normalized = sessionKey.trim() || "main";
  const readable = normalized.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 48) || "main";
  const digest = crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 12);
  return `${readable}-${digest}.json`;
}

function resolveOmegaSessionLockFile(params: {
  workspaceRoot: string;
  sessionKey: string;
}): string {
  return path.join(
    params.workspaceRoot,
    ".openskynet",
    "omega-session-locks",
    sanitizeSessionKey(params.sessionKey),
  );
}

export async function withOmegaSessionLock<T>(
  params: {
    workspaceRoot: string;
    sessionKey: string;
  },
  fn: () => Promise<T>,
): Promise<T> {
  return await withFileLock(
    resolveOmegaSessionLockFile(params),
    {
      retries: {
        retries: 20,
        factor: 1.3,
        minTimeout: 25,
        maxTimeout: 250,
      },
      stale: OMEGA_SESSION_LOCK_STALE_MS,
    },
    fn,
  );
}

export const OMEGA_SESSION_LOCK_OPTIONS = {
  timeoutMs: OMEGA_SESSION_LOCK_TIMEOUT_MS,
  staleMs: OMEGA_SESSION_LOCK_STALE_MS,
} as const;
