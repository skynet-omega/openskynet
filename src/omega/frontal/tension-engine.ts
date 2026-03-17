import type { OmegaSessionSelfState } from "../event-model.js";
import type { OmegaInputInterpretation } from "../interaction-model.js";
import type { OmegaSessionTimelineEntry } from "../session-context.js";
import type { OmegaSelfTimeKernelState } from "../self-time-kernel.js";

export type OmegaTensionState = {
  hasOpenGoal: boolean;
  repeatedFailure: boolean;
  repeatedFailureKinds: string[];
  needsCorrection: boolean;
  failureStreak: number;
  staleGoalCount: number;
  repeatedWriteFailure: boolean;
};

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.length > 0)));
}

export function deriveOmegaTensionState(params: {
  timeline: OmegaSessionTimelineEntry[];
  state?: OmegaSessionSelfState;
  kernel?: OmegaSelfTimeKernelState;
  interpretation: OmegaInputInterpretation;
}): OmegaTensionState {
  if (params.kernel) {
    const repeatedWriteFailure = params.kernel.tension.repeatedFailureKinds.some((kind) =>
      ["target_not_touched", "missing_target_writes"].includes(kind),
    );
    return {
      hasOpenGoal: params.kernel.tension.openGoalCount > 0,
      repeatedFailure: params.kernel.tension.repeatedFailureKinds.length > 0,
      repeatedFailureKinds: params.kernel.tension.repeatedFailureKinds,
      needsCorrection:
        params.kernel.tension.pendingCorrection ||
        params.interpretation.kind === "corrective_feedback",
      failureStreak: params.kernel.tension.failureStreak,
      staleGoalCount: params.kernel.tension.staleGoalCount,
      repeatedWriteFailure,
    };
  }

  const recentFailures = params.timeline
    .slice(-3)
    .filter((entry) => entry.outcome.status !== "ok")
    .map((entry) => entry.outcome.errorKind ?? "");
  const repeatedFailureKinds = unique(
    recentFailures.filter(
      (kind, index, all) => kind.length > 0 && all.indexOf(kind) !== index,
    ),
  );
  const repeatedFailure = repeatedFailureKinds.length > 0;
  const hasOpenGoal =
    typeof params.state?.activeGoal === "string" &&
    params.state.activeGoal.length > 0 &&
    params.state.lastOutcomeStatus !== "ok";
  const needsCorrection =
    params.interpretation.kind === "corrective_feedback" ||
    (params.interpretation.kind === "mixed_turn" && repeatedFailure);
  const repeatedWriteFailure = repeatedFailureKinds.some((kind) =>
    ["target_not_touched", "missing_target_writes"].includes(kind),
  );

  return {
    hasOpenGoal,
    repeatedFailure,
    repeatedFailureKinds,
    needsCorrection,
    failureStreak: recentFailures.length,
    staleGoalCount: 0,
    repeatedWriteFailure,
  };
}
