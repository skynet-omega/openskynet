import { readLoggingConfig } from "../logging/config.js";
import { redactIdentifier } from "../logging/redact-identifier.js";
import { getDefaultRedactPatterns, redactSensitiveText } from "../logging/redact.js";
import { getApiErrorPayloadFingerprint, parseApiErrorInfo } from "./pi-embedded-helpers.js";
import { stableStringify } from "./stable-stringify.js";
import { derivePromptTokens, normalizeUsage, type UsageLike } from "./usage.js";

const MAX_OBSERVATION_INPUT_CHARS = 64_000;
const MAX_FINGERPRINT_MESSAGE_CHARS = 8_000;
const RAW_ERROR_PREVIEW_MAX_CHARS = 400;
const PROVIDER_ERROR_PREVIEW_MAX_CHARS = 200;
const REQUEST_ID_RE = /\brequest[_ ]?id\b\s*[:=]\s*["'()]*([A-Za-z0-9._:-]+)/i;
const OBSERVATION_EXTRA_REDACT_PATTERNS = [
  String.raw`\b(?:x-)?api[-_]?key\b\s*[:=]\s*(["']?)([^\s"'\\;]+)\1`,
  String.raw`"(?:api[-_]?key|api_key)"\s*:\s*"([^"]+)"`,
  String.raw`(?:\bCookie\b\s*[:=]\s*[^;=\s]+=|;\s*[^;=\s]+=)([^;\s\r\n]+)`,
];

export type ApiRateLimitObservationClass = "quota_exhausted" | "capacity_unavailable";

type UsageObservationInput = {
  promptTokens?: number;
  usage?: UsageLike | null;
  lastCallUsage?: UsageLike | null;
};

function resolveConfiguredRedactPatterns(): string[] {
  const configured = readLoggingConfig()?.redactPatterns;
  if (!Array.isArray(configured)) {
    return [];
  }
  return configured.filter((pattern): pattern is string => typeof pattern === "string");
}

function truncateForObservation(text: string | undefined, maxChars: number): string | undefined {
  const trimmed = text?.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.length > maxChars ? `${trimmed.slice(0, maxChars)}…` : trimmed;
}

function boundObservationInput(text: string | undefined): string | undefined {
  const trimmed = text?.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.length > MAX_OBSERVATION_INPUT_CHARS
    ? trimmed.slice(0, MAX_OBSERVATION_INPUT_CHARS)
    : trimmed;
}

export function sanitizeForConsole(text: string | undefined, maxChars = 200): string | undefined {
  const trimmed = text?.trim();
  if (!trimmed) {
    return undefined;
  }
  const withoutControlChars = Array.from(trimmed)
    .filter((char) => {
      const code = char.charCodeAt(0);
      return !(
        code <= 0x08 ||
        code === 0x0b ||
        code === 0x0c ||
        (code >= 0x0e && code <= 0x1f) ||
        code === 0x7f
      );
    })
    .join("");
  const sanitized = withoutControlChars
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return sanitized.length > maxChars ? `${sanitized.slice(0, maxChars)}…` : sanitized;
}

function replaceRequestIdPreview(
  text: string | undefined,
  requestId: string | undefined,
): string | undefined {
  if (!text || !requestId) {
    return text;
  }
  return text.split(requestId).join(redactIdentifier(requestId, { len: 12 }));
}

function redactObservationText(text: string | undefined): string | undefined {
  if (!text) {
    return text;
  }
  // Observation logs must stay redacted even when operators disable general-purpose
  // log redaction, otherwise raw provider payloads leak back into always-on logs.
  const configuredPatterns = resolveConfiguredRedactPatterns();
  return redactSensitiveText(text, {
    mode: "tools",
    patterns: [
      ...getDefaultRedactPatterns(),
      ...configuredPatterns,
      ...OBSERVATION_EXTRA_REDACT_PATTERNS,
    ],
  });
}

function extractRequestId(text: string | undefined): string | undefined {
  if (!text) {
    return undefined;
  }
  const match = text.match(REQUEST_ID_RE);
  return match?.[1]?.trim() || undefined;
}

function buildObservationFingerprint(params: {
  raw: string;
  requestId?: string;
  httpCode?: string;
  type?: string;
  message?: string;
}): string | null {
  const boundedMessage =
    params.message && params.message.length > MAX_FINGERPRINT_MESSAGE_CHARS
      ? params.message.slice(0, MAX_FINGERPRINT_MESSAGE_CHARS)
      : params.message;
  const structured =
    params.httpCode || params.type || boundedMessage
      ? stableStringify({
          httpCode: params.httpCode,
          type: params.type,
          message: boundedMessage,
        })
      : null;
  if (structured) {
    return structured;
  }
  if (params.requestId) {
    return params.raw.split(params.requestId).join("<request_id>");
  }
  return getApiErrorPayloadFingerprint(params.raw);
}

function classifyApiRateLimitObservation(rawError?: string): {
  apiRateLimitClass?: ApiRateLimitObservationClass;
  apiRateLimitResetAfter?: string;
} {
  const trimmed = rawError?.trim();
  if (!trimmed) {
    return {};
  }
  const parsed = parseApiErrorInfo(trimmed);
  const lower = trimmed.toLowerCase();
  const is429 = parsed?.httpCode === "429" || lower.includes("429") || lower.includes("rate limit");
  if (!is429) {
    return {};
  }

  const resetMatch = trimmed.match(/quota will reset after\s+([^\n.]+)/i);
  const resetAfter = resetMatch?.[1]?.trim();
  const quotaExhausted =
    /quota will reset after/i.test(trimmed) ||
    /exhausted your capacity on this model/i.test(trimmed) ||
    /usage limit/i.test(trimmed) ||
    /quota exceeded/i.test(trimmed) ||
    /exceeded your current quota/i.test(trimmed) ||
    /resource has been exhausted/i.test(trimmed);

  if (quotaExhausted) {
    return {
      apiRateLimitClass: "quota_exhausted",
      apiRateLimitResetAfter: resetAfter,
    };
  }

  const capacityUnavailable =
    /no capacity available/i.test(trimmed) ||
    /temporary capacity issue/i.test(trimmed) ||
    /capacity unavailable/i.test(trimmed) ||
    /request rejected \(429\)/i.test(trimmed);
  if (capacityUnavailable) {
    return {
      apiRateLimitClass: "capacity_unavailable",
      apiRateLimitResetAfter: resetAfter,
    };
  }

  return {};
}

export function buildUsageObservationFields(input?: UsageObservationInput): {
  promptTokens?: number;
  usageInputTokens?: number;
  usageOutputTokens?: number;
  usageCacheReadTokens?: number;
  usageCacheWriteTokens?: number;
  usageTotalTokens?: number;
} {
  if (!input) {
    return {};
  }
  const usage = normalizeUsage(input.lastCallUsage ?? input.usage);
  const promptTokens =
    input.promptTokens && Number.isFinite(input.promptTokens) && input.promptTokens > 0
      ? Math.floor(input.promptTokens)
      : derivePromptTokens(usage);
  return {
    promptTokens,
    usageInputTokens: usage?.input,
    usageOutputTokens: usage?.output,
    usageCacheReadTokens: usage?.cacheRead,
    usageCacheWriteTokens: usage?.cacheWrite,
    usageTotalTokens: usage?.total,
  };
}

export function buildApiErrorObservationFields(rawError?: string): {
  rawErrorPreview?: string;
  rawErrorHash?: string;
  rawErrorFingerprint?: string;
  httpCode?: string;
  providerErrorType?: string;
  providerErrorMessagePreview?: string;
  requestIdHash?: string;
  apiRateLimitClass?: ApiRateLimitObservationClass;
  apiRateLimitResetAfter?: string;
} {
  const trimmed = boundObservationInput(rawError);
  if (!trimmed) {
    return {};
  }
  try {
    const parsed = parseApiErrorInfo(trimmed);
    const requestId = parsed?.requestId ?? extractRequestId(trimmed);
    const requestIdHash = requestId ? redactIdentifier(requestId, { len: 12 }) : undefined;
    const rawFingerprint = buildObservationFingerprint({
      raw: trimmed,
      requestId,
      httpCode: parsed?.httpCode,
      type: parsed?.type,
      message: parsed?.message,
    });
    const redactedRawPreview = replaceRequestIdPreview(redactObservationText(trimmed), requestId);
    const redactedProviderMessage = replaceRequestIdPreview(
      redactObservationText(parsed?.message),
      requestId,
    );

    return {
      rawErrorPreview: truncateForObservation(redactedRawPreview, RAW_ERROR_PREVIEW_MAX_CHARS),
      rawErrorHash: redactIdentifier(trimmed, { len: 12 }),
      rawErrorFingerprint: rawFingerprint
        ? redactIdentifier(rawFingerprint, { len: 12 })
        : undefined,
      httpCode: parsed?.httpCode,
      providerErrorType: parsed?.type,
      providerErrorMessagePreview: truncateForObservation(
        redactedProviderMessage,
        PROVIDER_ERROR_PREVIEW_MAX_CHARS,
      ),
      requestIdHash,
      ...classifyApiRateLimitObservation(trimmed),
    };
  } catch {
    return {};
  }
}

export function buildTextObservationFields(text?: string): {
  textPreview?: string;
  textHash?: string;
  textFingerprint?: string;
  httpCode?: string;
  providerErrorType?: string;
  providerErrorMessagePreview?: string;
  requestIdHash?: string;
  apiRateLimitClass?: ApiRateLimitObservationClass;
  apiRateLimitResetAfter?: string;
} {
  const observed = buildApiErrorObservationFields(text);
  return {
    textPreview: observed.rawErrorPreview,
    textHash: observed.rawErrorHash,
    textFingerprint: observed.rawErrorFingerprint,
    httpCode: observed.httpCode,
    providerErrorType: observed.providerErrorType,
    providerErrorMessagePreview: observed.providerErrorMessagePreview,
    requestIdHash: observed.requestIdHash,
    apiRateLimitClass: observed.apiRateLimitClass,
    apiRateLimitResetAfter: observed.apiRateLimitResetAfter,
  };
}
