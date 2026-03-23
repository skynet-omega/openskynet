export type VitestRunSummary = {
  testFilesPassed: number;
  testFilesTotal: number;
  testsPassed: number;
  testsTotal: number;
};

export type OmegaVsParentBenchmarkSummary = {
  buildOk: boolean;
  omegaSlice: VitestRunSummary | null;
  comparativeSlice: VitestRunSummary | null;
  targetedSuperiorityValidated: boolean;
};

const TEST_FILES_RE = /Test Files\s+(\d+)\s+passed\s+\((\d+)\)/;
const TESTS_RE = /Tests\s+(\d+)\s+passed(?:\s*\|\s*\d+\s+skipped)?\s+\((\d+)\)/;

export function parseVitestSummary(output: string): VitestRunSummary | null {
  const filesMatch = output.match(TEST_FILES_RE);
  const testsMatch = output.match(TESTS_RE);
  if (!filesMatch || !testsMatch) {
    return null;
  }
  return {
    testFilesPassed: Number.parseInt(filesMatch[1] ?? "", 10),
    testFilesTotal: Number.parseInt(filesMatch[2] ?? "", 10),
    testsPassed: Number.parseInt(testsMatch[1] ?? "", 10),
    testsTotal: Number.parseInt(testsMatch[2] ?? "", 10),
  };
}

export function computeOmegaVsParentBenchmarkSummary(params: {
  buildOk: boolean;
  omegaSlice: VitestRunSummary | null;
  comparativeSlice: VitestRunSummary | null;
}): OmegaVsParentBenchmarkSummary {
  const omegaSliceOk =
    params.omegaSlice !== null &&
    params.omegaSlice.testFilesPassed === params.omegaSlice.testFilesTotal &&
    params.omegaSlice.testsPassed === params.omegaSlice.testsTotal;
  const comparativeSliceOk =
    params.comparativeSlice !== null &&
    params.comparativeSlice.testFilesPassed === params.comparativeSlice.testFilesTotal &&
    params.comparativeSlice.testsPassed === params.comparativeSlice.testsTotal;

  return {
    buildOk: params.buildOk,
    omegaSlice: params.omegaSlice,
    comparativeSlice: params.comparativeSlice,
    targetedSuperiorityValidated: params.buildOk && omegaSliceOk && comparativeSliceOk,
  };
}
