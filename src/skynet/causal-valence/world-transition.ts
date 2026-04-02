export type SkynetTransitionOperationKind = "create" | "edit" | "delete" | "rename" | "noop";

export type SkynetWorldTransitionOperation = {
  path: string;
  kind: SkynetTransitionOperationKind;
  isTarget?: boolean;
};

export type SkynetWorldTransitionObservation = {
  operations: SkynetWorldTransitionOperation[];
  targetPaths?: string[];
};

export type SkynetWorldTransitionFeatures = {
  operationCount: number;
  uniquePathCount: number;
  targetCount: number;
  targetedPathCount: number;
  createRatio: number;
  editRatio: number;
  deleteRatio: number;
  renameRatio: number;
  noopRatio: number;
  targetCoverage: number;
  collateralRatio: number;
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function sanitizePath(path: string): string {
  return path.trim();
}

export function deriveSkynetWorldTransitionFeatures(
  observation: SkynetWorldTransitionObservation,
): SkynetWorldTransitionFeatures {
  const operations = observation.operations.filter(
    (operation) => typeof operation.path === "string" && operation.path.trim().length > 0,
  );
  const operationCount = operations.length;
  const targetPathSet = new Set(
    (observation.targetPaths ?? []).map(sanitizePath).filter((path) => path.length > 0),
  );
  const uniquePathSet = new Set(operations.map((operation) => sanitizePath(operation.path)));
  const targetedPathSet = new Set(
    operations
      .filter((operation) => operation.isTarget || targetPathSet.has(sanitizePath(operation.path)))
      .map((operation) => sanitizePath(operation.path)),
  );

  const countKind = (kind: SkynetTransitionOperationKind): number =>
    operations.filter((operation) => operation.kind === kind).length;
  const ratio = (count: number): number =>
    operationCount > 0 ? clamp01(count / operationCount) : 0;
  const targetCount = targetPathSet.size;

  return {
    operationCount,
    uniquePathCount: uniquePathSet.size,
    targetCount,
    targetedPathCount: targetedPathSet.size,
    createRatio: ratio(countKind("create")),
    editRatio: ratio(countKind("edit")),
    deleteRatio: ratio(countKind("delete")),
    renameRatio: ratio(countKind("rename")),
    noopRatio: ratio(countKind("noop")),
    targetCoverage: targetCount > 0 ? clamp01(targetedPathSet.size / targetCount) : 0,
    collateralRatio:
      operationCount > 0 ? clamp01((operationCount - targetedPathSet.size) / operationCount) : 0,
  };
}
