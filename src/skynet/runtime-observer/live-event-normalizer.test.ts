import { describe, expect, it } from "vitest";
import type { EventFrame } from "../../gateway/protocol/index.js";
import { normalizeSkynetRuntimeGatewayEvent } from "./live-event-normalizer.js";

describe("runtime observer live event normalizer", () => {
  it("normalizes agent tool events", () => {
    const frame = {
      type: "event",
      seq: 12,
      event: "agent",
      payload: {
        runId: "run-1",
        sessionKey: "agent:main:main",
        stream: "tool",
        seq: 4,
        ts: 1234,
        data: {
          phase: "start",
          toolName: "exec",
        },
      },
    } as EventFrame;

    const normalized = normalizeSkynetRuntimeGatewayEvent(frame);
    expect(normalized).toMatchObject({
      event: "agent",
      runId: "run-1",
      sessionKey: "agent:main:main",
      stream: "tool",
      phase: "start",
      toolName: "exec",
      seq: 4,
      rawTs: 1234,
    });
  });

  it("normalizes session message previews", () => {
    const frame = {
      type: "event",
      seq: 2,
      event: "session.message",
      payload: {
        sessionKey: "agent:main:main",
        ts: 4321,
        message: {
          role: "assistant",
          content: [{ type: "text", text: "hola mundo desde openskynet" }],
        },
      },
    } as EventFrame;

    const normalized = normalizeSkynetRuntimeGatewayEvent(frame);
    expect(normalized).toMatchObject({
      event: "session.message",
      sessionKey: "agent:main:main",
      role: "assistant",
      textPreview: "hola mundo desde openskynet",
      rawTs: 4321,
    });
  });
});
