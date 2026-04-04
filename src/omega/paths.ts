import crypto from "node:crypto";
import path from "node:path";

export function resolveOmegaStateDir(workspacePath: string): string {
  return path.join(workspacePath, ".openskynet");
}

export function resolveOmegaLegacyStateDir(workspacePath: string): string {
  return path.join(workspacePath, ".openclaw");
}

export function resolveOmegaStateFile(workspacePath: string, filename: string): string {
  return path.join(resolveOmegaStateDir(workspacePath), filename);
}

export function resolveOmegaLegacyStateFile(workspacePath: string, filename: string): string {
  return path.join(resolveOmegaLegacyStateDir(workspacePath), filename);
}

/**
 * Canonical session-key → safe filename conversion.
 * Single source of truth — do not inline this in individual modules.
 * Changing the algorithm here changes the on-disk path for ALL stores simultaneously.
 */
export function sanitizeOmegaSessionKey(sessionKey: string): string {
  const normalized = sessionKey.trim() || "main";
  const readable = normalized.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 48) || "main";
  const digest = crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 12);
  return `${readable}-${digest}.json`;
}
