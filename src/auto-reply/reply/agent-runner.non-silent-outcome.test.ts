import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TemplateContext } from "../templating.js";
import type { GetReplyOptions, ReplyPayload } from "../types.js";
import type { FollowupRun, QueueSettings } from "./queue.js";
import { createMockTypingController } from "./test-helpers.js";

type AgentRunParams = {
  onToolResult?: (payload: ReplyPayload) => Promise<void> | void;
  onAgentEvent?: (evt: { stream: string; data: Record<string, unknown> }) => Promise<void> | void;
  onBlockReply?: (payload: ReplyPayload) => Promise<void> | void;
};

const state = vi.hoisted(() => ({
  runEmbeddedPiAgentMock: vi.fn(),
}));

vi.mock("../../agents/model-fallback.js", () => ({
  runWithModelFallback: async ({
    provider,
    model,
    run,
  }: {
    provider: string;
    model: string;
    run: (provider: string, model: string) => Promise<unknown>;
  }) => ({
    result: await run(provider, model),
    provider,
    model,
    attempts: [],
  }),
}));

vi.mock("../../agents/pi-embedded.js", () => ({
  queueEmbeddedPiMessage: vi.fn().mockReturnValue(false),
  runEmbeddedPiAgent: (params: unknown) => state.runEmbeddedPiAgentMock(params),
}));

vi.mock("./queue.js", async () => {
  const actual = await vi.importActual<typeof import("./queue.js")>("./queue.js");
  return {
    ...actual,
    enqueueFollowupRun: vi.fn(),
    scheduleFollowupDrain: vi.fn(),
  };
});

import { runReplyAgent } from "./agent-runner.js";

beforeEach(() => {
  state.runEmbeddedPiAgentMock.mockReset();
});

function createRun(params?: {
  opts?: GetReplyOptions;
  blockStreamingEnabled?: boolean;
  typingMode?: "instant" | "message";
  sessionCtxOverrides?: Partial<TemplateContext>;
  runOverrides?: Partial<FollowupRun["run"]>;
}) {
  const typing = createMockTypingController();
  const sessionCtx = {
    Provider: "whatsapp",
    OriginatingTo: "+15550001111",
    AccountId: "primary",
    MessageSid: "msg",
    ...params?.sessionCtxOverrides,
  } as unknown as TemplateContext;
  const resolvedQueue = { mode: "interrupt" } as unknown as QueueSettings;
  const followupRun = {
    prompt: "hello",
    summaryLine: "hello",
    enqueuedAt: Date.now(),
    run: {
      sessionId: "session",
      sessionKey: "main",
      messageProvider: "whatsapp",
      sessionFile: "/tmp/session.jsonl",
      workspaceDir: "/tmp",
      config: {},
      skillsSnapshot: {},
      provider: "anthropic",
      model: "claude",
      thinkLevel: "low",
      verboseLevel: "off",
      elevatedLevel: "off",
      bashElevated: {
        enabled: false,
        allowed: false,
        defaultLevel: "off",
      },
      timeoutMs: 1_000,
      blockReplyBreak: "message_end",
      ...params?.runOverrides,
    },
  } as unknown as FollowupRun;

  return runReplyAgent({
    commandBody: "hello",
    followupRun,
    queueKey: "main",
    resolvedQueue,
    shouldSteer: false,
    shouldFollowup: false,
    isActive: false,
    isStreaming: false,
    opts: params?.opts,
    typing,
    sessionCtx,
    defaultModel: "anthropic/claude-opus-4-5",
    resolvedVerboseLevel: "off",
    isNewSession: false,
    blockStreamingEnabled: params?.blockStreamingEnabled ?? false,
    resolvedBlockStreamingBreak: "message_end",
    shouldInjectGroupIntro: false,
    typingMode: params?.typingMode ?? "instant",
  });
}

describe("runReplyAgent non-silent outcome guard", () => {
  it("surfaces a degraded final reply after hidden tool work with no final payload", async () => {
    const cases = [
      {
        label: "whatsapp",
        sessionCtxOverrides: { Provider: "whatsapp" },
        runOverrides: { messageProvider: "whatsapp" },
      },
      {
        label: "telegram",
        sessionCtxOverrides: { Provider: "telegram" },
        runOverrides: { messageProvider: "telegram" },
      },
      {
        label: "discord",
        sessionCtxOverrides: { Provider: "discord" },
        runOverrides: { messageProvider: "discord" },
      },
    ] as const;

    for (const testCase of cases) {
      state.runEmbeddedPiAgentMock.mockImplementationOnce(async (params: AgentRunParams) => {
        await params.onAgentEvent?.({
          stream: "tool",
          data: { phase: "start", name: "exec" },
        });
        return {
          payloads: [],
          meta: { stopReason: "toolUse" },
        };
      });

      const result = await createRun({
        sessionCtxOverrides: testCase.sessionCtxOverrides,
        runOverrides: testCase.runOverrides,
      });
      const payload = Array.isArray(result) ? result[0] : result;

      expect(payload, testCase.label).toMatchObject({
        text: expect.stringContaining("did not finish a final reply"),
      });
    }
  });

  it("does not synthesize a degraded reply when block streaming already delivered visible output", async () => {
    const onBlockReply = vi.fn();
    state.runEmbeddedPiAgentMock.mockImplementationOnce(async (params: AgentRunParams) => {
      await params.onAgentEvent?.({
        stream: "tool",
        data: { phase: "start", name: "browser" },
      });
      await params.onBlockReply?.({ text: "visible progress" });
      return {
        payloads: [],
        meta: { stopReason: "toolUse" },
      };
    });

    const result = await createRun({
      blockStreamingEnabled: true,
      opts: { onBlockReply },
      typingMode: "message",
    });

    expect(result).toBeUndefined();
    expect(onBlockReply).toHaveBeenCalledWith(
      expect.objectContaining({ text: "visible progress" }),
      expect.objectContaining({
        abortSignal: expect.any(AbortSignal),
        timeoutMs: expect.any(Number),
      }),
    );
  });

  it("keeps explicit no-op turns silent when there was no visible reply and no tool activity", async () => {
    state.runEmbeddedPiAgentMock.mockResolvedValueOnce({
      payloads: [],
      meta: { stopReason: "stop" },
    });

    const result = await createRun();

    expect(result).toBeUndefined();
  });

  it("surfaces a degraded final reply after an execution error with no final payload", async () => {
    state.runEmbeddedPiAgentMock.mockResolvedValueOnce({
      payloads: [],
      meta: { stopReason: "error" },
    });

    const result = await createRun({
      sessionCtxOverrides: { Provider: "telegram" },
      runOverrides: { messageProvider: "telegram" },
    });
    const payload = Array.isArray(result) ? result[0] : result;

    expect(payload).toMatchObject({
      text: expect.stringContaining("did not finish a final reply"),
    });
  });
});
