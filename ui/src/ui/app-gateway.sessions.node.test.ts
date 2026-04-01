import { describe, expect, it, vi } from "vitest";

const loadSessionsMock = vi.fn();
const loadChatHistoryMock = vi.fn();
const handleSessionMessageEventMock = vi.fn<
  (typeof import("./controllers/chat.ts"))["handleSessionMessageEvent"]
>(() => null);

vi.mock("./app-chat.ts", () => ({
  CHAT_SESSIONS_ACTIVE_MINUTES: 10,
  flushChatQueueForEvent: vi.fn(),
}));
vi.mock("./app-settings.ts", () => ({
  applySettings: vi.fn(),
  loadCron: vi.fn(),
  refreshActiveTab: vi.fn(),
  setLastActiveSessionKey: vi.fn(),
}));
vi.mock("./app-tool-stream.ts", () => ({
  handleAgentEvent: vi.fn(),
  resetToolStream: vi.fn(),
}));
vi.mock("./controllers/agents.ts", () => ({
  loadAgents: vi.fn(),
}));
vi.mock("./controllers/assistant-identity.ts", () => ({
  loadAssistantIdentity: vi.fn(),
}));
vi.mock("./controllers/chat.ts", () => ({
  loadChatHistory: loadChatHistoryMock,
  handleChatEvent: vi.fn(() => "idle"),
  handleSessionMessageEvent: handleSessionMessageEventMock,
  syncSessionMessageSubscription: vi.fn(),
}));
vi.mock("./controllers/devices.ts", () => ({
  loadDevices: vi.fn(),
}));
vi.mock("./controllers/exec-approval.ts", () => ({
  addExecApproval: vi.fn(),
  parseExecApprovalRequested: vi.fn(() => null),
  parseExecApprovalResolved: vi.fn(() => null),
  removeExecApproval: vi.fn(),
}));
vi.mock("./controllers/health.ts", () => ({
  loadHealthState: vi.fn(),
}));
vi.mock("./controllers/nodes.ts", () => ({
  loadNodes: vi.fn(),
}));
vi.mock("./controllers/sessions.ts", () => ({
  loadSessions: loadSessionsMock,
  subscribeSessions: vi.fn(),
}));
vi.mock("./gateway.ts", () => ({
  GatewayBrowserClient: class {},
  resolveGatewayErrorDetailCode: () => null,
}));

const { handleGatewayEvent } = await import("./app-gateway.ts");

function createHost() {
  return {
    settings: {
      gatewayUrl: "ws://127.0.0.1:18789",
      token: "",
      sessionKey: "main",
      lastActiveSessionKey: "main",
      theme: "claw",
      themeMode: "system",
      chatFocusMode: false,
      chatShowThinking: true,
      chatShowToolCalls: true,
      splitRatio: 0.6,
      navCollapsed: false,
      navWidth: 280,
      navGroupsCollapsed: {},
      borderRadius: 50,
    },
    password: "",
    clientInstanceId: "instance-test",
    client: null,
    connected: true,
    hello: null,
    lastError: null,
    lastErrorCode: null,
    eventLogBuffer: [],
    eventLog: [],
    tab: "overview",
    presenceEntries: [],
    presenceError: null,
    presenceStatus: null,
    agentsLoading: false,
    agentsList: null,
    agentsError: null,
    healthLoading: false,
    healthResult: null,
    healthError: null,
    debugHealth: null,
    assistantName: "OpenClaw",
    assistantAvatar: null,
    assistantAgentId: null,
    serverVersion: null,
    sessionKey: "main",
    chatRunId: null,
    refreshSessionsAfterChat: new Set<string>(),
    execApprovalQueue: [],
    execApprovalError: null,
    updateAvailable: null,
  } as unknown as Parameters<typeof handleGatewayEvent>[0];
}

describe("handleGatewayEvent sessions.changed", () => {
  it("reloads sessions when the gateway pushes a sessions.changed event", () => {
    loadSessionsMock.mockReset();
    const host = createHost();

    handleGatewayEvent(host, {
      type: "event",
      event: "sessions.changed",
      payload: { sessionKey: "agent:main:main", phase: "start" },
      seq: 1,
    });

    expect(loadSessionsMock).toHaveBeenCalledTimes(1);
    expect(loadSessionsMock).toHaveBeenCalledWith(host);
  });
});

describe("handleGatewayEvent session.message", () => {
  it("routes live session transcript events through the chat controller", () => {
    loadChatHistoryMock.mockReset();
    handleSessionMessageEventMock.mockReset();
    handleSessionMessageEventMock.mockReturnValue("appended");
    const host = createHost();

    handleGatewayEvent(host, {
      type: "event",
      event: "session.message",
      payload: {
        sessionKey: "main",
        message: { role: "assistant", content: [{ type: "text", text: "Live" }] },
      },
      seq: 2,
    });

    expect(handleSessionMessageEventMock).toHaveBeenCalledTimes(1);
    expect(loadChatHistoryMock).not.toHaveBeenCalled();
  });

  it("reloads chat history when the controller requests a fallback reload", () => {
    loadChatHistoryMock.mockReset();
    handleSessionMessageEventMock.mockReset();
    handleSessionMessageEventMock.mockReturnValue("reload");
    const host = createHost();

    handleGatewayEvent(host, {
      type: "event",
      event: "session.message",
      payload: {
        sessionKey: "main",
        message: { role: "tool" },
      },
      seq: 3,
    });

    expect(loadChatHistoryMock).toHaveBeenCalledTimes(1);
    expect(loadChatHistoryMock).toHaveBeenCalledWith(host);
  });
});
