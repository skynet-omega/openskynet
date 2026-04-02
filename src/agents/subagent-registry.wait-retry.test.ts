import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const noop = () => {};
const MAIN_REQUESTER_SESSION_KEY = "agent:main:main";
const MAIN_REQUESTER_DISPLAY_KEY = "main";

const callGatewayMock = vi.fn(async (request: unknown) => {
  const method = (request as { method?: string }).method;
  if (method === "agent.wait") {
    throw new Error("temporary gateway failure");
  }
  return {};
});

vi.mock("../gateway/call.js", () => ({
  callGateway: callGatewayMock,
}));

vi.mock("../infra/agent-events.js", () => ({
  onAgentEvent: vi.fn((_handler: unknown) => noop),
}));

vi.mock("../config/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/config.js")>();
  return {
    ...actual,
    loadConfig: vi.fn(() => ({
      agents: { defaults: { subagents: { archiveAfterMinutes: 0 } } },
    })),
  };
});

const announceSpy = vi.fn(async () => true);
vi.mock("./subagent-announce.js", () => ({
  runSubagentAnnounceFlow: announceSpy,
  captureSubagentCompletionReply: vi.fn(async () => undefined),
}));

vi.mock("../plugins/hook-runner-global.js", () => ({
  getGlobalHookRunner: vi.fn(() => null),
}));

vi.mock("./subagent-registry.store.js", () => ({
  loadSubagentRegistryFromDisk: vi.fn(() => new Map()),
  saveSubagentRegistryToDisk: vi.fn(() => {}),
}));

describe("subagent registry wait retry", () => {
  let mod: typeof import("./subagent-registry.js");

  beforeAll(async () => {
    mod = await import("./subagent-registry.js");
  });

  beforeEach(() => {
    vi.useFakeTimers();
    announceSpy.mockReset().mockResolvedValue(true);
    callGatewayMock.mockReset();
    callGatewayMock.mockImplementation(async (request: unknown) => {
      const method = (request as { method?: string }).method;
      if (method === "agent.wait") {
        throw new Error("temporary gateway failure");
      }
      return {};
    });
  });

  afterEach(() => {
    mod.resetSubagentRegistryForTests({ persist: false });
    vi.useRealTimers();
  });

  it("retries agent.wait after transient gateway failure", async () => {
    let waitCalls = 0;
    callGatewayMock.mockImplementation(async (request: unknown) => {
      const method = (request as { method?: string }).method;
      if (method === "agent.wait") {
        waitCalls += 1;
        if (waitCalls === 1) {
          throw new Error("temporary gateway failure");
        }
        return { status: "timeout", endedAt: 1234 };
      }
      return {};
    });

    mod.registerSubagentRun({
      runId: "run-retry",
      childSessionKey: "agent:main:subagent:wait-retry",
      requesterSessionKey: MAIN_REQUESTER_SESSION_KEY,
      requesterDisplayKey: MAIN_REQUESTER_DISPLAY_KEY,
      task: "retry wait",
      cleanup: "keep",
    });

    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    await Promise.resolve();

    expect(waitCalls).toBeGreaterThanOrEqual(2);

    const run = mod
      .listSubagentRunsForRequester(MAIN_REQUESTER_SESSION_KEY)
      .find((entry) => entry.runId === "run-retry");
    expect(run?.outcome).toMatchObject({ status: "timeout" });
  });
});
