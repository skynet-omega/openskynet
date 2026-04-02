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

  it("preserves classified lifecycle failures from agent events", () => {
    const frame = {
      type: "event",
      seq: 13,
      event: "agent",
      payload: {
        runId: "run-2",
        sessionKey: "agent:main:main",
        stream: "lifecycle",
        seq: 5,
        ts: 2345,
        data: {
          phase: "error",
          error: "connection refused",
          failureDomain: "environmental",
          failureClass: "gateway_connection",
        },
      },
    } as EventFrame;

    const normalized = normalizeSkynetRuntimeGatewayEvent(frame);
    expect(normalized).toMatchObject({
      event: "agent",
      runId: "run-2",
      stream: "lifecycle",
      phase: "error",
      failureDomain: "environmental",
      failureClass: "gateway_connection",
      textPreview: "connection refused",
      seq: 5,
      rawTs: 2345,
    });
  });

  it("preserves classified tool failures from session.tool events", () => {
    const frame = {
      type: "event",
      seq: 14,
      event: "session.tool",
      payload: {
        runId: "run-3",
        sessionKey: "agent:main:main",
        stream: "tool",
        seq: 6,
        ts: 3456,
        data: {
          phase: "result",
          name: "edit",
          isError: true,
          failureDomain: "cognitive",
          failureClass: "validation_error",
          result: { details: { status: "error", error: "syntax error" } },
        },
      },
    } as EventFrame;

    const normalized = normalizeSkynetRuntimeGatewayEvent(frame);
    expect(normalized).toMatchObject({
      event: "session.tool",
      runId: "run-3",
      stream: "tool",
      toolPhase: "result",
      isError: true,
      failureDomain: "cognitive",
      failureClass: "validation_error",
      seq: 6,
      rawTs: 3456,
    });
    expect(normalized?.textPreview).toContain("syntax error");
  });

  it("derives missing classification for tool failures from shared runtime taxonomy", () => {
    const frame = {
      type: "event",
      seq: 15,
      event: "session.tool",
      payload: {
        runId: "run-4",
        sessionKey: "agent:main:main",
        stream: "tool",
        seq: 7,
        ts: 4567,
        data: {
          phase: "result",
          name: "read",
          isError: true,
          result: { details: { status: "error", error: "ENOENT: no such file or directory" } },
        },
      },
    } as EventFrame;

    const normalized = normalizeSkynetRuntimeGatewayEvent(frame);
    expect(normalized).toMatchObject({
      event: "session.tool",
      runId: "run-4",
      stream: "tool",
      toolPhase: "result",
      isError: true,
      failureDomain: "cognitive",
      failureClass: "missing_path",
      seq: 7,
      rawTs: 4567,
    });
    expect(normalized?.textPreview).toContain("ENOENT");
  });

  it("derives missing classification for lifecycle errors from shared runtime taxonomy", () => {
    const frame = {
      type: "event",
      seq: 16,
      event: "agent",
      payload: {
        runId: "run-5",
        sessionKey: "agent:main:main",
        stream: "lifecycle",
        seq: 8,
        ts: 5678,
        data: {
          phase: "error",
          error: "API rate limit reached",
        },
      },
    } as EventFrame;

    const normalized = normalizeSkynetRuntimeGatewayEvent(frame);
    expect(normalized).toMatchObject({
      event: "agent",
      runId: "run-5",
      stream: "lifecycle",
      phase: "error",
      failureDomain: "environmental",
      failureClass: "provider_rate_limit",
      seq: 8,
      rawTs: 5678,
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
