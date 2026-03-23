export const OMEGA_DEFAULT_AUTONOMOUS_INTERVAL_MINUTES = 5;
export const OMEGA_INTERACTION_LOCK_REFRESH_MS = 10 * 1000;
export const OMEGA_INTERACTION_LOCK_TIMEOUT_MS = 5 * 60 * 1000;

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
