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
