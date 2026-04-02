import type { SkynetRuntimeLiveObservation } from "./live-event-normalizer.js";

export type SkynetRuntimeLiveFailureEvent = {
  id: string;
  recordedAt: number;
  sessionKey?: string;
  runId?: string;
  failureDomain: string;
  failureClass: string;
  textPreview?: string;
};

export type SkynetRuntimeLiveFailureHarvest = {
  observedEvents: number;
  lifecycleErrors: number;
  classifiedLifecycleErrors: number;
  toolErrors: number;
  classifiedToolErrors: number;
  classificationCoverage: number;
  failureCountsByDomain: Record<string, number>;
  failureCountsByClass: Record<string, number>;
  recentFailures: SkynetRuntimeLiveFailureEvent[];
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function harvestSkynetRuntimeLiveFailures(params: {
  observations: SkynetRuntimeLiveObservation[];
  recentLimit?: number;
}): SkynetRuntimeLiveFailureHarvest {
  const recentLimit = Math.max(1, Math.min(20, params.recentLimit ?? 5));
  const lifecycleErrors = params.observations.filter(
    (entry) => entry.event === "agent" && entry.stream === "lifecycle" && entry.phase === "error",
  );
  const toolErrors = params.observations.filter(
    (entry) =>
      (entry.event === "agent" || entry.event === "session.tool") &&
      entry.stream === "tool" &&
      entry.toolPhase === "result" &&
      entry.isError === true,
  );
  const classifiedLifecycle = lifecycleErrors.filter(
    (entry) =>
      typeof entry.failureDomain === "string" &&
      entry.failureDomain.trim().length > 0 &&
      typeof entry.failureClass === "string" &&
      entry.failureClass.trim().length > 0,
  );
  const classifiedTool = toolErrors.filter(
    (entry) =>
      typeof entry.failureDomain === "string" &&
      entry.failureDomain.trim().length > 0 &&
      typeof entry.failureClass === "string" &&
      entry.failureClass.trim().length > 0,
  );
  const classified = [...classifiedLifecycle, ...classifiedTool];

  const failureCountsByDomain: Record<string, number> = {};
  const failureCountsByClass: Record<string, number> = {};
  for (const entry of classified) {
    const domain = entry.failureDomain!.trim();
    const klass = entry.failureClass!.trim();
    failureCountsByDomain[domain] = (failureCountsByDomain[domain] ?? 0) + 1;
    failureCountsByClass[klass] = (failureCountsByClass[klass] ?? 0) + 1;
  }

  const recentFailures = [...classified]
    .sort((left, right) => right.recordedAt - left.recordedAt)
    .slice(0, recentLimit)
    .map((entry, index) => ({
      id: `${entry.runId ?? "run"}:${entry.recordedAt}:${index}:${entry.failureClass ?? "unknown"}`,
      recordedAt: entry.recordedAt,
      sessionKey: entry.sessionKey,
      runId: entry.runId,
      failureDomain: entry.failureDomain!,
      failureClass: entry.failureClass!,
      textPreview: entry.textPreview,
    }));

  return {
    observedEvents: params.observations.length,
    lifecycleErrors: lifecycleErrors.length,
    classifiedLifecycleErrors: classifiedLifecycle.length,
    toolErrors: toolErrors.length,
    classifiedToolErrors: classifiedTool.length,
    classificationCoverage: clamp01(
      lifecycleErrors.length + toolErrors.length > 0
        ? classified.length / (lifecycleErrors.length + toolErrors.length)
        : 0,
    ),
    failureCountsByDomain,
    failureCountsByClass,
    recentFailures,
  };
}
