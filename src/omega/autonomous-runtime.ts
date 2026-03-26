export const OMEGA_DEFAULT_AUTONOMOUS_INTERVAL_MINUTES = 5;
export const OMEGA_INTERACTION_LOCK_REFRESH_MS = 10 * 1000;
export const OMEGA_INTERACTION_LOCK_TIMEOUT_MS = 60 * 1000;
export const OMEGA_DEFAULT_SESSION_KEY = "openskynet";

export type OmegaAutonomousRuntimeOptions = {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  fallbackWorkspaceRoot?: string;
  fallbackSessionKey?: string;
  fallbackIntervalMinutes?: number;
};

export function resolveOmegaAutonomousIntervalMinutes(
  rawValue: string | number | undefined,
  fallback = OMEGA_DEFAULT_AUTONOMOUS_INTERVAL_MINUTES,
): number {
  if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
    return rawValue > 0 ? Math.floor(rawValue) : fallback;
  }
  if (typeof rawValue !== "string" || rawValue.trim() === "") {
    return fallback;
  }
  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveOmegaWorkspaceRoot(options: OmegaAutonomousRuntimeOptions = {}): string {
  const env = options.env ?? process.env;
  return env.WORKSPACE_ROOT || options.cwd || options.fallbackWorkspaceRoot || process.cwd();
}

export function resolveOmegaSessionKey(options: OmegaAutonomousRuntimeOptions = {}): string {
  const env = options.env ?? process.env;
  return env.SESSION_KEY || options.fallbackSessionKey || OMEGA_DEFAULT_SESSION_KEY;
}

export function resolveOmegaRuntimeDefaults(options: OmegaAutonomousRuntimeOptions = {}): {
  workspaceRoot: string;
  sessionKey: string;
  intervalMinutes: number;
} {
  const env = options.env ?? process.env;
  return {
    workspaceRoot: resolveOmegaWorkspaceRoot(options),
    sessionKey: resolveOmegaSessionKey(options),
    intervalMinutes: resolveOmegaAutonomousIntervalMinutes(
      env.OPENSKYNET_INTERVAL_MINUTES,
      options.fallbackIntervalMinutes ?? OMEGA_DEFAULT_AUTONOMOUS_INTERVAL_MINUTES,
    ),
  };
}
