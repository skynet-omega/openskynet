import { Type } from "@sinclair/typebox";
import { readStringArrayParam } from "./common.js";

export const OMEGA_VALIDATION_SCHEMA_FIELDS = {
  expectsJson: Type.Optional(Type.Boolean()),
  expectedKeys: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { maxItems: 16 })),
  expectedPaths: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { maxItems: 16 })),
};

export type OmegaValidationToolParams = {
  expectsJson: boolean;
  expectedKeys: string[];
  expectedPaths: string[];
  requiresValidation: boolean;
};

export function buildOmegaValidationPrompt(params: {
  expectedKeys: string[];
  expectedPaths: string[];
}): string | undefined {
  const lines: string[] = [];
  if (params.expectedPaths.length > 0) {
    lines.push("[OMEGA Local Edit Contract]");
    lines.push("Apply the smallest viable change and preserve unrelated files and behavior.");
    lines.push(
      `Only claim success after touching every required target path: ${params.expectedPaths.join(", ")}`,
    );
    lines.push("Do not report a code fix if the required target paths were not actually changed.");
  }
  if (params.expectedKeys.length > 0) {
    lines.push("[OMEGA Structured Output Contract]");
    lines.push(`Return exactly one JSON object containing these keys: ${params.expectedKeys.join(", ")}`);
    lines.push("Do not add prose before or after the JSON object.");
  }
  if (lines.length === 0) {
    return undefined;
  }
  return lines.join("\n");
}

export function readOmegaValidationToolParams(
  params: Record<string, unknown>,
): OmegaValidationToolParams {
  const expectsJson = params.expectsJson === true;
  const expectedKeys = readStringArrayParam(params, "expectedKeys") ?? [];
  const expectedPaths = readStringArrayParam(params, "expectedPaths") ?? [];
  return {
    expectsJson,
    expectedKeys,
    expectedPaths,
    requiresValidation: expectsJson || expectedKeys.length > 0 || expectedPaths.length > 0,
  };
}
