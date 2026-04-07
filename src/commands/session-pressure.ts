export type SessionPressure = "unknown" | "ok" | "watch" | "compact" | "rollover";

export const SESSION_PRESSURE_WATCH_TOKENS = 120_000;
export const SESSION_PRESSURE_COMPACT_TOKENS = 160_000;
export const SESSION_PRESSURE_ROLLOVER_TOKENS = 220_000;

export function classifySessionPressure(params: {
  totalTokens: number | null | undefined;
  contextTokens?: number | null | undefined;
}): SessionPressure {
  const total = params.totalTokens;
  if (!(typeof total === "number") || !Number.isFinite(total) || total <= 0) {
    return "unknown";
  }

  const context = params.contextTokens;
  const pct =
    typeof context === "number" && Number.isFinite(context) && context > 0
      ? (total / context) * 100
      : null;

  // These bands are operational cost-control thresholds, not hard overflow
  // limits. They keep long-lived sessions visible before they drift into the
  // 200k+ range where quota burn becomes expensive.
  if (total >= SESSION_PRESSURE_ROLLOVER_TOKENS || (pct !== null && pct >= 90)) {
    return "rollover";
  }
  if (total >= SESSION_PRESSURE_COMPACT_TOKENS || (pct !== null && pct >= 75)) {
    return "compact";
  }
  if (total >= SESSION_PRESSURE_WATCH_TOKENS || (pct !== null && pct >= 60)) {
    return "watch";
  }
  return "ok";
}

export function formatSessionPressureLabel(pressure: SessionPressure): string {
  switch (pressure) {
    case "watch":
      return "WATCH";
    case "compact":
      return "COMPACT";
    case "rollover":
      return "ROLLOVER";
    default:
      return "";
  }
}
