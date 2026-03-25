import type { OmegaStructuredTask, OmegaValidationResult } from "./types.js";

function extractJsonObject(text: string): Record<string, unknown> | null {
  const payload = (text ?? "").trim();
  if (!payload) {
    return null;
  }
  try {
    const parsed = JSON.parse(payload);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    // Initial strict parse failed, will try regex extraction below
  }
  const matches = payload.match(/\{[\s\S]*\}/g) ?? [];
  for (const candidate of matches) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Candidate parse failed, continue to next
    }
  }
  return null;
}

export function validateStructuredOmegaResult(
  task: OmegaStructuredTask,
  resultText: string,
): OmegaValidationResult {
  if (!task.expectsJson) {
    return { ok: true, message: "no structured validation requested" };
  }
  const parsed = extractJsonObject(resultText);
  const expectedKeys = task.expectedKeys ?? [];
  const missingKeys = expectedKeys.filter((key) => !(parsed && key in parsed));
  if (!parsed || missingKeys.length > 0) {
    return {
      ok: false,
      errorKind: "invalid_structured_result",
      message: "OMEGA result did not satisfy the requested JSON contract.",
      expectedKeys,
    };
  }
  return { ok: true, message: "structured contract satisfied", expectedKeys };
}

export function validateObservedWrite(params: {
  expectedPaths: string[];
  observedChangedFiles: string[];
  watchedPaths?: string[];
}): OmegaValidationResult {
  const expected = params.expectedPaths.map((item) => item.trim()).filter(Boolean);
  const observed = params.observedChangedFiles.map((item) => item.trim()).filter(Boolean);
  const watched = (params.watchedPaths ?? [])
    .map((item) => item.trim())
    .filter((item) => item && !expected.includes(item));

  const matchedExpectedPaths = expected.filter((path) =>
    observed.some((item) => item === path || item.endsWith(path)),
  );

  const unexpectedWrites = observed.filter(
    (item) => !expected.includes(item) && watched.some((w) => item === w || item.endsWith(w)),
  );

  if (unexpectedWrites.length > 0) {
    return {
      ok: false,
      errorKind: "unexpected_collateral_writes" as any,
      message: "OMEGA detected writes on watched paths not in the target set.",
      expectedPaths: expected,
      observedChangedFiles: observed,
    };
  }

  if (matchedExpectedPaths.length === 0) {
    return {
      ok: false,
      errorKind: "target_not_touched",
      message: "OMEGA detected no real disk delta on the target paths.",
      expectedPaths: expected,
      observedChangedFiles: observed,
    };
  }
  const missingExpectedPaths = expected.filter((path) => !matchedExpectedPaths.includes(path));
  if (missingExpectedPaths.length > 0) {
    return {
      ok: false,
      errorKind: "missing_target_writes",
      message: "OMEGA observed disk changes, but not on every required target path.",
      expectedPaths: expected,
      observedChangedFiles: observed,
      missingExpectedPaths,
    };
  }
  return {
    ok: true,
    message: "observed disk delta on every required target path",
    expectedPaths: expected,
    observedChangedFiles: observed,
  };
}
