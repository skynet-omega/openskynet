export type OpenSkynetRuntimeFailureDomain = "none" | "environmental" | "cognitive" | "mixed";

export type OpenSkynetRuntimeFailureClass =
  | "none"
  | "provider_rate_limit"
  | "provider_timeout"
  | "gateway_restart"
  | "gateway_connection"
  | "permission_denied"
  | "session_lock"
  | "missing_path"
  | "validation_error"
  | "unknown_error";

export type OpenSkynetRuntimeFailure = {
  failureDomain: OpenSkynetRuntimeFailureDomain;
  failureClass: OpenSkynetRuntimeFailureClass;
};

function normalizeFailureText(input: unknown): string {
  return typeof input === "string" ? input.toLowerCase() : "";
}

export function classifyOpenSkynetRuntimeFailure(params: {
  status?: string;
  errorText?: string;
  isOk?: boolean;
}): OpenSkynetRuntimeFailure {
  const status = normalizeFailureText(params.status);
  const errorText = normalizeFailureText(params.errorText);
  const isOk = params.isOk === true;

  if (isOk) {
    return { failureDomain: "none", failureClass: "none" };
  }

  if (
    errorText.includes("rate limit") ||
    errorText.includes("no capacity available") ||
    errorText.includes("resource exhausted") ||
    errorText.includes("api rate limit reached") ||
    errorText.includes("too many requests") ||
    errorText.includes("429")
  ) {
    return { failureDomain: "environmental", failureClass: "provider_rate_limit" };
  }

  if (
    errorText.includes("service restart") ||
    errorText.includes("config change detected") ||
    errorText.includes("restarting") ||
    errorText.includes("wait for active embedded runs timed out")
  ) {
    return { failureDomain: "environmental", failureClass: "gateway_restart" };
  }

  if (errorText.includes("session file locked") || errorText.includes("lock timeout")) {
    return { failureDomain: "environmental", failureClass: "session_lock" };
  }

  if (status === "timeout" || errorText.includes("timed out") || errorText.includes("timeout")) {
    return { failureDomain: "environmental", failureClass: "provider_timeout" };
  }

  if (
    errorText.includes("gateway closed") ||
    errorText.includes("connection reset") ||
    errorText.includes("connection refused") ||
    errorText.includes("token mismatch")
  ) {
    return { failureDomain: "environmental", failureClass: "gateway_connection" };
  }

  if (
    errorText.includes("permission denied") ||
    errorText.includes("eacces") ||
    errorText.includes("operation not permitted")
  ) {
    return { failureDomain: "environmental", failureClass: "permission_denied" };
  }

  if (
    errorText.includes("enoent") ||
    errorText.includes("no such file") ||
    errorText.includes("cannot find")
  ) {
    return { failureDomain: "cognitive", failureClass: "missing_path" };
  }

  if (
    errorText.includes("syntax error") ||
    errorText.includes("type error") ||
    errorText.includes("validation failed") ||
    errorText.includes("test failed")
  ) {
    return { failureDomain: "cognitive", failureClass: "validation_error" };
  }

  return { failureDomain: "mixed", failureClass: "unknown_error" };
}
