function normalizePaths(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function observedMatchesPath(observedPath: string, candidatePath: string): boolean {
  return observedPath === candidatePath || observedPath.endsWith(candidatePath);
}

export type OmegaLocalEditAssessment = {
  matchedExpectedPaths: string[];
  missingExpectedPaths: string[];
  collateralObservedPaths: string[];
};

export function assessOmegaLocalEdit(params: {
  expectedPaths: string[];
  observedChangedFiles: string[];
  watchedPaths?: string[];
}): OmegaLocalEditAssessment {
  const expectedPaths = normalizePaths(params.expectedPaths);
  const observedChangedFiles = normalizePaths(params.observedChangedFiles);
  const watchedPaths = normalizePaths(params.watchedPaths ?? []);

  const matchedExpectedPaths = expectedPaths.filter((expectedPath) =>
    observedChangedFiles.some((observedPath) => observedMatchesPath(observedPath, expectedPath)),
  );

  const missingExpectedPaths = expectedPaths.filter(
    (expectedPath) => !matchedExpectedPaths.includes(expectedPath),
  );

  const collateralObservedPaths =
    watchedPaths.length > 0
      ? observedChangedFiles.filter(
          (observedPath) =>
            watchedPaths.some((watchedPath) => observedMatchesPath(observedPath, watchedPath)) &&
            !expectedPaths.some((expectedPath) => observedMatchesPath(observedPath, expectedPath)),
        )
      : [];

  return {
    matchedExpectedPaths,
    missingExpectedPaths,
    collateralObservedPaths,
  };
}
