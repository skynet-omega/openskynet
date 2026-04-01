import type { EventFrame } from "../../gateway/protocol/index.js";

export type SkynetRuntimeLiveObservation = {
  source: "gateway";
  event: string;
  recordedAt: number;
  sessionKey?: string;
  runId?: string;
  stream?: string;
  phase?: string;
  toolName?: string;
  toolPhase?: string;
  role?: string;
  status?: string;
  textPreview?: string;
  seq?: number;
  rawTs?: number;
};

function trimToUndefined(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function previewText(value: unknown, maxChars = 240): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return undefined;
  }
  return normalized.length > maxChars ? `${normalized.slice(0, maxChars - 1)}…` : normalized;
}

function extractMessagePreview(message: unknown): { role?: string; textPreview?: string } {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return {};
  }
  const record = message as {
    role?: unknown;
    content?: unknown;
    text?: unknown;
    toolName?: unknown;
  };
  const content = Array.isArray(record.content) ? record.content : [];
  const textPart = content.find(
    (part) => part && typeof part === "object" && (part as { type?: string }).type === "text",
  ) as { text?: unknown } | undefined;
  const toolUsePart = content.find(
    (part) => part && typeof part === "object" && (part as { type?: string }).type === "tool_use",
  ) as { name?: unknown } | undefined;
  return {
    role: trimToUndefined(record.role),
    textPreview:
      previewText(textPart?.text) ??
      previewText(record.text) ??
      previewText(toolUsePart?.name) ??
      previewText(record.toolName),
  };
}

export function normalizeSkynetRuntimeGatewayEvent(
  frame: EventFrame,
): SkynetRuntimeLiveObservation | null {
  const recordedAt = Date.now();
  if (frame.type !== "event") {
    return null;
  }

  if (frame.event === "agent" || frame.event === "session.tool") {
    const payload =
      frame.payload && typeof frame.payload === "object" && !Array.isArray(frame.payload)
        ? (frame.payload as {
            runId?: unknown;
            sessionKey?: unknown;
            stream?: unknown;
            seq?: unknown;
            ts?: unknown;
            data?: Record<string, unknown>;
          })
        : undefined;
    const data = payload?.data ?? {};
    return {
      source: "gateway",
      event: frame.event,
      recordedAt,
      sessionKey: trimToUndefined(payload?.sessionKey),
      runId: trimToUndefined(payload?.runId),
      stream: trimToUndefined(payload?.stream),
      phase: trimToUndefined(data.phase),
      toolName: trimToUndefined(data.toolName),
      toolPhase: trimToUndefined(data.phase),
      status: trimToUndefined(data.status),
      textPreview: previewText(data.text) ?? previewText(data.error),
      seq: typeof payload?.seq === "number" ? payload.seq : undefined,
      rawTs: typeof payload?.ts === "number" ? payload.ts : undefined,
    };
  }

  if (frame.event === "sessions.changed") {
    const payload =
      frame.payload && typeof frame.payload === "object" && !Array.isArray(frame.payload)
        ? (frame.payload as {
            sessionKey?: unknown;
            phase?: unknown;
            runId?: unknown;
            ts?: unknown;
          })
        : undefined;
    return {
      source: "gateway",
      event: frame.event,
      recordedAt,
      sessionKey: trimToUndefined(payload?.sessionKey),
      runId: trimToUndefined(payload?.runId),
      phase: trimToUndefined(payload?.phase),
      rawTs: typeof payload?.ts === "number" ? payload.ts : undefined,
    };
  }

  if (frame.event === "session.message") {
    const payload =
      frame.payload && typeof frame.payload === "object" && !Array.isArray(frame.payload)
        ? (frame.payload as { sessionKey?: unknown; ts?: unknown; message?: unknown })
        : undefined;
    const messageSummary = extractMessagePreview(payload?.message);
    return {
      source: "gateway",
      event: frame.event,
      recordedAt,
      sessionKey: trimToUndefined(payload?.sessionKey),
      role: messageSummary.role,
      textPreview: messageSummary.textPreview,
      rawTs: typeof payload?.ts === "number" ? payload.ts : undefined,
    };
  }

  return null;
}
