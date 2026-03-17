import type {
  OmegaSessionOutcomeSnapshot,
  OmegaSessionTimelineEntry,
  OmegaSessionValidationSnapshot,
} from "./session-context.js";
import { interpretOmegaInput, type OmegaInteractionKind } from "./interaction-model.js";

const OMEGA_STATE_CONSTRAINT_LIMIT = 6;

export type OmegaSessionSelfState = {
  activeGoal?: string;
  activeTargets: string[];
  requiredKeys: string[];
  lastInteractionKind?: OmegaInteractionKind;
  lastTask?: string;
  lastOutcomeStatus?: "ok" | "error" | "timeout";
  lastErrorKind?: string;
  lastSuccessfulTask?: string;
  lastFailedTask?: string;
  learnedConstraints: string[];
  updatedAt: number;
};

function uniqueItems(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function constraintFromErrorKind(errorKind?: string): string[] {
  switch (errorKind) {
    case "invalid_structured_result":
      return ["return_exact_json_object"];
    case "target_not_touched":
      return ["touch_required_targets"];
    case "missing_target_writes":
      return ["touch_every_required_target"];
    default:
      return [];
  }
}

export function deriveOmegaSessionSelfState(params: {
  priorState?: OmegaSessionSelfState;
  task: string;
  validation: OmegaSessionValidationSnapshot;
  outcome: OmegaSessionOutcomeSnapshot;
  timeline: OmegaSessionTimelineEntry[];
}): OmegaSessionSelfState {
  const prior = params.priorState;
  const interpretation = interpretOmegaInput({
    task: params.task,
    validation: params.validation,
    timeline: params.timeline,
  });
  const actionfulTurn =
    interpretation.hasActionRequest || params.validation.expectedPaths.length > 0;
  const activeGoal = actionfulTurn ? params.task : prior?.activeGoal;
  const activeTargets =
    params.validation.expectedPaths.length > 0
      ? params.validation.expectedPaths
      : (prior?.activeTargets ?? []);
  const requiredKeys =
    params.validation.expectedKeys.length > 0
      ? params.validation.expectedKeys
      : (prior?.requiredKeys ?? []);
  const learnedConstraints = uniqueItems([
    ...(prior?.learnedConstraints ?? []),
    ...constraintFromErrorKind(params.outcome.errorKind),
  ]).slice(-OMEGA_STATE_CONSTRAINT_LIMIT);

  return {
    activeGoal,
    activeTargets,
    requiredKeys,
    lastInteractionKind: interpretation.kind,
    lastTask: params.task,
    lastOutcomeStatus: params.outcome.status,
    lastErrorKind: params.outcome.errorKind,
    lastSuccessfulTask:
      params.outcome.status === "ok" ? params.task : prior?.lastSuccessfulTask,
    lastFailedTask:
      params.outcome.status !== "ok" ? params.task : prior?.lastFailedTask,
    learnedConstraints,
    updatedAt: Date.now(),
  };
}
