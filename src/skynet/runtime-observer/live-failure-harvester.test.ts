import { describe, expect, it } from "vitest";
import { harvestSkynetRuntimeLiveFailures } from "./live-failure-harvester.js";

describe("runtime observer live failure harvester", () => {
  it("harvests classified lifecycle failures from live observations", () => {
    const result = harvestSkynetRuntimeLiveFailures({
      observations: [
        {
          source: "gateway",
          event: "agent",
          recordedAt: 100,
          runId: "run-1",
          sessionKey: "agent:main:main",
          stream: "lifecycle",
          phase: "error",
          failureDomain: "environmental",
          failureClass: "gateway_connection",
          textPreview: "connection refused",
        },
        {
          source: "gateway",
          event: "agent",
          recordedAt: 200,
          runId: "run-2",
          sessionKey: "agent:main:main",
          stream: "lifecycle",
          phase: "error",
          failureDomain: "environmental",
          failureClass: "provider_rate_limit",
          textPreview: "429",
        },
        {
          source: "gateway",
          event: "agent",
          recordedAt: 300,
          runId: "run-3",
          sessionKey: "agent:main:main",
          stream: "assistant",
          phase: "delta",
          textPreview: "hola",
        },
        {
          source: "gateway",
          event: "session.tool",
          recordedAt: 400,
          runId: "run-4",
          sessionKey: "agent:main:main",
          stream: "tool",
          toolPhase: "result",
          isError: true,
          failureDomain: "cognitive",
          failureClass: "validation_error",
          textPreview: "syntax error",
        },
      ],
    });

    expect(result).toMatchObject({
      observedEvents: 4,
      lifecycleErrors: 2,
      toolErrors: 1,
      classifiedLifecycleErrors: 2,
      classifiedToolErrors: 1,
      classificationCoverage: 1,
      failureCountsByDomain: {
        environmental: 2,
        cognitive: 1,
      },
      failureCountsByClass: {
        gateway_connection: 1,
        provider_rate_limit: 1,
        validation_error: 1,
      },
    });
    expect(result.recentFailures[0]).toMatchObject({
      runId: "run-4",
      failureClass: "validation_error",
    });
  });
});
