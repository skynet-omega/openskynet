import { readErrorName } from "../infra/errors.js";
import {
  classifyFailoverReason,
  classifyFailoverReasonFromHttpStatus,
  isTimeoutErrorMessage,
  type FailoverReason,
} from "./pi-embedded-helpers.js";

const ABORT_TIMEOUT_RE = /request was aborted|request aborted/i;

export class FailoverError extends Error {
  readonly reason: FailoverReason;
  readonly provider?: string;
  readonly model?: string;
  readonly profileId?: string;
  readonly status?: number;
  readonly code?: string;

  constructor(
    message: string,
    params: {
      reason: FailoverReason;
      provider?: string;
      model?: string;
      profileId?: string;
      status?: number;
      code?: string;
      cause?: unknown;
    },
  ) {
    super(message, { cause: params.cause });
    this.name = "FailoverError";
    this.reason = params.reason;
    this.provider = params.provider;
    this.model = params.model;
    this.profileId = params.profileId;
    this.status = params.status;
    this.code = params.code;
  }
}

export function isFailoverError(err: unknown): err is FailoverError {
  return err instanceof FailoverError;
}

export function resolveFailoverStatus(reason: FailoverReason): number | undefined {
  switch (reason) {
    case "billing":
      return 402;
    case "rate_limit":
      return 429;
    case "overloaded":
      return 503;
    case "auth":
      return 401;
    case "auth_permanent":
      return 403;
    case "timeout":
      return 408;
    case "format":
      return 400;
    case "model_not_found":
      return 404;
    case "session_expired":
      return 410; // Gone - session no longer exists
    default:
      return undefined;
  }
}

function getStatusCode(err: unknown): number | undefined {
  const readDirectStatusCode = (candidateErr: unknown): number | undefined => {
    if (!candidateErr || typeof candidateErr !== "object") {
      return undefined;
    }
    const candidate =
      (candidateErr as { status?: unknown; statusCode?: unknown }).status ??
      (candidateErr as { statusCode?: unknown }).statusCode;
    if (typeof candidate === "number") {
      return candidate;
    }
    if (typeof candidate === "string" && /^\d+$/.test(candidate)) {
      return Number(candidate);
    }
    return undefined;
  };
  return findErrorProperty(err, readDirectStatusCode);
}

function findErrorProperty<T>(
  err: unknown,
  reader: (candidate: unknown) => T | undefined,
  seen: Set<object> = new Set(),
): T | undefined {
  const direct = reader(err);
  if (direct !== undefined) {
    return direct;
  }
  if (!err || typeof err !== "object") {
    return undefined;
  }
  if (seen.has(err)) {
    return undefined;
  }
  seen.add(err);
  const candidate = err as { error?: unknown; cause?: unknown };
  return (
    findErrorProperty(candidate.error, reader, seen) ??
    findErrorProperty(candidate.cause, reader, seen)
  );
}

function getErrorCode(err: unknown): string | undefined {
  return findErrorProperty(err, (candidateErr) => {
    if (!candidateErr || typeof candidateErr !== "object") {
      return undefined;
    }
    const directCode = (candidateErr as { code?: unknown }).code;
    if (typeof directCode === "string") {
      const trimmed = directCode.trim();
      return trimmed ? trimmed : undefined;
    }
    const status = (candidateErr as { status?: unknown }).status;
    if (typeof status !== "string" || /^\d+$/.test(status)) {
      return undefined;
    }
    const trimmed = status.trim();
    return trimmed ? trimmed : undefined;
  });
}

function getErrorMessage(err: unknown): string {
  return (
    findErrorProperty(err, (candidateErr) => {
      if (candidateErr instanceof Error) {
        return candidateErr.message || undefined;
      }
      if (typeof candidateErr === "string") {
        return candidateErr || undefined;
      }
      if (
        typeof candidateErr === "number" ||
        typeof candidateErr === "boolean" ||
        typeof candidateErr === "bigint"
      ) {
        return String(candidateErr);
      }
      if (typeof candidateErr === "symbol") {
        return candidateErr.description ?? undefined;
      }
      if (candidateErr && typeof candidateErr === "object") {
        const message = (candidateErr as { message?: unknown }).message;
        if (typeof message === "string") {
          return message || undefined;
        }
      }
      return undefined;
    }) ?? ""
  );
}

function hasTimeoutHint(err: unknown): boolean {
  if (!err) {
    return false;
  }
  if (readErrorName(err) === "TimeoutError") {
    return true;
  }
  const message = getErrorMessage(err);
  return Boolean(message && isTimeoutErrorMessage(message));
}

function getErrorCause(err: unknown): unknown {
  if (!err || typeof err !== "object" || !("cause" in err)) {
    return undefined;
  }
  return (err as { cause?: unknown }).cause;
}

export function isTimeoutError(err: unknown): boolean {
  if (hasTimeoutHint(err)) {
    return true;
  }
  if (!err || typeof err !== "object") {
    return false;
  }
  if (readErrorName(err) !== "AbortError") {
    return false;
  }
  const message = getErrorMessage(err);
  if (message && ABORT_TIMEOUT_RE.test(message)) {
    return true;
  }
  const cause = "cause" in err ? (err as { cause?: unknown }).cause : undefined;
  const reason = "reason" in err ? (err as { reason?: unknown }).reason : undefined;
  return hasTimeoutHint(cause) || hasTimeoutHint(reason);
}

export function resolveFailoverReasonFromError(err: unknown): FailoverReason | null {
  if (isFailoverError(err)) {
    return err.reason;
  }

  const cause = getErrorCause(err);
  const status = getStatusCode(err);
  const message = getErrorMessage(err);
  const statusReason = classifyFailoverReasonFromHttpStatus(status, message);
  if (statusReason) {
    if (statusReason === "timeout" && cause && cause !== err) {
      const causeReason = resolveFailoverReasonFromError(cause);
      if (causeReason && causeReason !== "timeout") {
        return causeReason;
      }
    }
    return statusReason;
  }

  const code = (getErrorCode(err) ?? "").toUpperCase();
  if (
    [
      "ETIMEDOUT",
      "ESOCKETTIMEDOUT",
      "ECONNRESET",
      "ECONNABORTED",
      "ECONNREFUSED",
      "ENETUNREACH",
      "EHOSTUNREACH",
      "EHOSTDOWN",
      "ENETRESET",
      "EPIPE",
      "EAI_AGAIN",
    ].includes(code)
  ) {
    return "timeout";
  }
  if (isTimeoutError(err)) {
    if (cause && cause !== err) {
      const causeReason = resolveFailoverReasonFromError(cause);
      if (causeReason && causeReason !== "timeout") {
        return causeReason;
      }
    }
    return "timeout";
  }
  if (!message) {
    if (cause && cause !== err) {
      return resolveFailoverReasonFromError(cause);
    }
    return null;
  }
  const directReason = classifyFailoverReason(message);
  if ((directReason === null || directReason === "timeout") && cause && cause !== err) {
    const causeReason = resolveFailoverReasonFromError(cause);
    if (causeReason && (directReason === null || causeReason !== "timeout")) {
      return causeReason;
    }
  }
  return directReason;
}

export function describeFailoverError(err: unknown): {
  message: string;
  reason?: FailoverReason;
  status?: number;
  code?: string;
} {
  if (isFailoverError(err)) {
    return {
      message: err.message,
      reason: err.reason,
      status: err.status,
      code: err.code,
    };
  }
  const message = getErrorMessage(err) || String(err);
  return {
    message,
    reason: resolveFailoverReasonFromError(err) ?? undefined,
    status: getStatusCode(err),
    code: getErrorCode(err),
  };
}

export function coerceToFailoverError(
  err: unknown,
  context?: {
    provider?: string;
    model?: string;
    profileId?: string;
  },
): FailoverError | null {
  if (isFailoverError(err)) {
    return err;
  }
  const reason = resolveFailoverReasonFromError(err);
  if (!reason) {
    return null;
  }

  const message = getErrorMessage(err) || String(err);
  const status = getStatusCode(err) ?? resolveFailoverStatus(reason);
  const code = getErrorCode(err);

  return new FailoverError(message, {
    reason,
    provider: context?.provider,
    model: context?.model,
    profileId: context?.profileId,
    status,
    code,
    cause: err instanceof Error ? err : undefined,
  });
}
