import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

type ObservedFileFingerprint = {
  exists: boolean;
  size?: number;
  mtimeMs?: number;
  sha1?: string;
};

type ObservedWriteTarget = {
  requestedPath: string;
  absolutePath: string;
  normalizedPath: string;
  before: ObservedFileFingerprint;
};

export type ObservedWriteBaseline = {
  workspaceRoot: string;
  targets: ObservedWriteTarget[];
};

const INLINE_HASH_MAX_BYTES = 2_000_000;

async function fingerprintFile(filePath: string): Promise<ObservedFileFingerprint> {
  try {
    const stat = await fs.stat(filePath);
    const fingerprint: ObservedFileFingerprint = {
      exists: true,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
    };
    if (stat.isFile() && stat.size <= INLINE_HASH_MAX_BYTES) {
      const content = await fs.readFile(filePath);
      fingerprint.sha1 = crypto.createHash("sha1").update(content).digest("hex");
    }
    return fingerprint;
  } catch {
    return { exists: false };
  }
}

function normalizeObservedPath(workspaceRoot: string, filePath: string): string {
  const relative = path.relative(workspaceRoot, filePath);
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
    return relative.split(path.sep).join("/");
  }
  return filePath.split(path.sep).join("/");
}

function normalizeTargetPath(workspaceRoot: string, requestedPath: string): ObservedWriteTarget | null {
  const trimmed = requestedPath.trim();
  if (!trimmed) {
    return null;
  }
  const absolutePath = path.isAbsolute(trimmed)
    ? path.resolve(trimmed)
    : path.resolve(workspaceRoot, trimmed);
  return {
    requestedPath: trimmed,
    absolutePath,
    normalizedPath: normalizeObservedPath(workspaceRoot, absolutePath),
    before: { exists: false },
  };
}

export async function createObservedWriteBaseline(params: {
  workspaceRoot: string;
  expectedPaths: string[];
}): Promise<ObservedWriteBaseline> {
  const workspaceRoot = path.resolve(params.workspaceRoot);
  const dedupedTargets = new Map<string, ObservedWriteTarget>();
  for (const rawPath of params.expectedPaths) {
    const normalized = normalizeTargetPath(workspaceRoot, rawPath);
    if (!normalized || dedupedTargets.has(normalized.absolutePath)) {
      continue;
    }
    dedupedTargets.set(normalized.absolutePath, normalized);
  }

  const targets = await Promise.all(
    Array.from(dedupedTargets.values()).map(async (target) => ({
      ...target,
      before: await fingerprintFile(target.absolutePath),
    })),
  );

  return {
    workspaceRoot,
    targets,
  };
}

export async function collectObservedWriteChanges(
  baseline: ObservedWriteBaseline,
): Promise<string[]> {
  const changed: string[] = [];
  for (const target of baseline.targets) {
    const after = await fingerprintFile(target.absolutePath);
    const beforeJson = JSON.stringify(target.before);
    const afterJson = JSON.stringify(after);
    if (beforeJson !== afterJson) {
      changed.push(target.normalizedPath);
    }
  }
  return changed;
}
