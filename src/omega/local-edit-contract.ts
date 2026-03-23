function normalizePaths(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export type OmegaLocalEditContract = {
  targetPaths: string[];
  protectedPaths: string[];
  totalScopePaths: string[];
};

export type OmegaLocalEditTelemetry = {
  targetPathsTouched: string[];
  missingTargetPaths: string[];
  collateralObservedPaths: string[];
  localityScore: number;
  protectedPreservationRate: number;
};

export function deriveOmegaLocalEditContract(params: {
  expectedPaths: string[];
  watchedPaths?: string[];
}): OmegaLocalEditContract {
  const targetPaths = normalizePaths(params.expectedPaths);
  const watchedPaths = normalizePaths(params.watchedPaths ?? []);
  const protectedPaths = watchedPaths.filter((path) => !targetPaths.includes(path));
  return {
    targetPaths,
    protectedPaths,
    totalScopePaths: normalizePaths([...targetPaths, ...protectedPaths]),
  };
}

export function summarizeOmegaLocalEditTelemetry(params: {
  contract: OmegaLocalEditContract;
  matchedExpectedPaths: string[];
  missingExpectedPaths: string[];
  collateralObservedPaths: string[];
}): OmegaLocalEditTelemetry {
  const targetPathsTouched = normalizePaths(params.matchedExpectedPaths);
  const missingTargetPaths = normalizePaths(params.missingExpectedPaths);
  const collateralObservedPaths = normalizePaths(params.collateralObservedPaths);
  const targetCount = Math.max(1, params.contract.targetPaths.length);
  const protectedCount = params.contract.protectedPaths.length;
  const localityNumerator = Math.max(0, targetPathsTouched.length - collateralObservedPaths.length);

  return {
    targetPathsTouched,
    missingTargetPaths,
    collateralObservedPaths,
    localityScore: Math.max(0, Math.min(1, localityNumerator / targetCount)),
    protectedPreservationRate:
      protectedCount > 0
        ? Math.max(
            0,
            Math.min(1, (protectedCount - collateralObservedPaths.length) / protectedCount),
          )
        : 1,
  };
}
