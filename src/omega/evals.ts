import { critiqueOmegaOutcome, type OmegaOutcomeCritique } from "./critic.js";
import type {
  OmegaSessionTaskValidationRequest,
  OmegaSessionTaskValidationSummary,
} from "./types.js";
import { validateObservedWrite, validateStructuredOmegaResult } from "./validator.js";

export type OmegaTurnEvaluation = {
  ok: boolean;
  validation: OmegaSessionTaskValidationSummary;
  critique: OmegaOutcomeCritique;
  errorKind?: OmegaOutcomeCritique["errorKind"];
  message: string;
};

export function evaluateOmegaTurn(params: {
  task: string;
  validation?: OmegaSessionTaskValidationRequest;
  reply?: string;
  observedChangedFiles?: string[];
}): OmegaTurnEvaluation {
  const requestedValidation = params.validation ?? {};
  const validationSummary: OmegaSessionTaskValidationSummary = {};
  const expectedKeys = requestedValidation.expectedKeys ?? [];
  const expectedPaths = requestedValidation.expectedPaths ?? [];
  const watchedPaths = requestedValidation.watchedPaths ?? [];
  const expectsJson = requestedValidation.expectsJson === true;

  if (expectsJson || expectedKeys.length > 0) {
    validationSummary.structured = validateStructuredOmegaResult(
      {
        task: params.task,
        expectsJson: true,
        expectedKeys,
      },
      params.reply ?? "",
    );
  }

  if (expectedPaths.length > 0) {
    validationSummary.write = validateObservedWrite({
      expectedPaths,
      observedChangedFiles: params.observedChangedFiles ?? [],
      watchedPaths,
    });
  }

  const critique = critiqueOmegaOutcome({
    task: params.task,
    validation: validationSummary,
    reply: params.reply,
    observedChangedFiles: params.observedChangedFiles,
    expectedPaths,
  });
  validationSummary.critic = critique;

  if (validationSummary.structured && !validationSummary.structured.ok) {
    return {
      ok: false,
      validation: validationSummary,
      critique,
      errorKind: validationSummary.structured.errorKind,
      message: validationSummary.structured.message,
    };
  }

  if (validationSummary.write && !validationSummary.write.ok) {
    return {
      ok: false,
      validation: validationSummary,
      critique,
      errorKind: validationSummary.write.errorKind,
      message: validationSummary.write.message,
    };
  }

  if (critique.errorKind === "low_value_result") {
    return {
      ok: false,
      validation: validationSummary,
      critique,
      errorKind: critique.errorKind,
      message: critique.message,
    };
  }

  return {
    ok: true,
    validation: validationSummary,
    critique,
    message: critique.message,
  };
}
