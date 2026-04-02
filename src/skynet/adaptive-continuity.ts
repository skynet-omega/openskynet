export type AdaptiveContinuityInputs = {
  focusStreak: number;
  retainedRatio: number;
  sameMode: boolean;
  modeShiftCount: number;
};

export type AdaptiveContinuityPrior = {
  ruleContinuityScore?: number;
  adaptiveContinuityScore?: number;
  adaptiveRetention?: number;
};

export type AdaptiveContinuitySnapshot = {
  ruleContinuityScore: number;
  adaptiveContinuityScore: number;
  adaptiveRetention: number;
  flux: number;
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value));
}

export function deriveRuleContinuityScore(params: AdaptiveContinuityInputs): number {
  return clamp01(
    0.35 +
      Math.min(params.focusStreak, 4) * 0.12 +
      params.retainedRatio * 0.22 +
      (params.sameMode ? 0.1 : 0) -
      Math.min(params.modeShiftCount, 4) * 0.04,
  );
}

export function deriveAdaptiveContinuitySnapshot(params: {
  inputs: AdaptiveContinuityInputs;
  prior?: AdaptiveContinuityPrior;
}): AdaptiveContinuitySnapshot {
  const ruleContinuityScore = deriveRuleContinuityScore(params.inputs);
  const priorRule = params.prior?.ruleContinuityScore ?? ruleContinuityScore;
  const priorAdaptive = params.prior?.adaptiveContinuityScore ?? ruleContinuityScore;
  const focusFlux = params.inputs.focusStreak <= 1 ? 0.18 : 0;
  const modeFlux = params.inputs.sameMode ? 0 : 0.12;
  const scoreFlux = Math.abs(ruleContinuityScore - priorRule);
  const retentionFlux = 1 - params.inputs.retainedRatio;
  const flux = clamp01(scoreFlux + focusFlux + modeFlux + retentionFlux * 0.15);
  const modulation = sigmoid((flux - 0.18) * 6);
  const adaptiveRetention = clamp01(Math.max(0.55, Math.min(0.98, 1 - 0.35 * modulation)));
  const adaptiveContinuityScore = clamp01(
    adaptiveRetention * priorAdaptive + (1 - adaptiveRetention) * ruleContinuityScore,
  );

  return {
    ruleContinuityScore,
    adaptiveContinuityScore,
    adaptiveRetention,
    flux,
  };
}
