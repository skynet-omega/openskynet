import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const callGatewayMock = vi.fn();

vi.mock("../gateway/call.js", () => ({
  callGateway: (opts: unknown) => callGatewayMock(opts),
}));

vi.mock("../config/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/config.js")>();
  return {
    ...actual,
    loadConfig: () => ({
      session: {
        mainKey: "main",
        scope: "per-sender",
        agentToAgent: { maxPingPongTurns: 0 },
      },
      tools: {
        sessions: { visibility: "all" },
      },
    }),
    resolveGatewayPort: () => 18789,
  };
});

import "./test-helpers/fast-core-tools.js";
import { createOpenClawTools } from "./openclaw-tools.js";

async function createWorkspaceFixture(): Promise<{
  root: string;
  targetPath: string;
  relativeTargetPath: string;
}> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "openskynet-sessions-send-"));
  const relativeTargetPath = path.join("workspace", "manual_code_probe", "range_tools.py");
  const targetPath = path.join(root, relativeTargetPath);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, "def clamp(v):\n    return v\n", "utf-8");
  return {
    root,
    targetPath,
    relativeTargetPath: relativeTargetPath.split(path.sep).join("/"),
  };
}

describe("sessions_send omega validation", () => {
  let workspaceRoot = "";
  let targetPath = "";
  let relativeTargetPath = "";

  beforeEach(async () => {
    callGatewayMock.mockClear();
    const fixture = await createWorkspaceFixture();
    workspaceRoot = fixture.root;
    targetPath = fixture.targetPath;
    relativeTargetPath = fixture.relativeTargetPath;
  });

  afterEach(async () => {
    if (workspaceRoot) {
      await fs.rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  function getSessionsSendTool() {
    const tool = createOpenClawTools({
      agentSessionKey: "main",
      agentChannel: "discord",
      workspaceDir: workspaceRoot,
    }).find((candidate) => candidate.name === "sessions_send");
    expect(tool).toBeDefined();
    if (!tool) {
      throw new Error("missing sessions_send tool");
    }
    return tool;
  }

  it("rejects fire-and-forget validation requests", async () => {
    const tool = getSessionsSendTool();

    const result = await tool.execute("call-fire", {
      sessionKey: "main",
      message: "return structured json",
      timeoutSeconds: 0,
      expectsJson: true,
      expectedKeys: ["status", "summary"],
    });

    expect(result.details).toMatchObject({
      status: "error",
      errorKind: "validation_requires_wait",
    });
    expect(callGatewayMock).not.toHaveBeenCalled();
  });

  it("rejects replies that do not satisfy the requested JSON contract", async () => {
    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const request = opts as { method?: string };
      if (request.method === "agent") {
        return { runId: "run-1", status: "accepted" };
      }
      if (request.method === "agent.wait") {
        return { status: "ok" };
      }
      if (request.method === "chat.history") {
        return {
          messages: [
            {
              role: "assistant",
              content: [{ type: "text", text: '{"status":"ok"}' }],
            },
          ],
        };
      }
      throw new Error(`unexpected method: ${String(request.method)}`);
    });

    const tool = getSessionsSendTool();
    const result = await tool.execute("call-json", {
      sessionKey: "main",
      message: "return json",
      timeoutSeconds: 1,
      expectsJson: true,
      expectedKeys: ["status", "summary"],
    });

    expect(result.details).toMatchObject({
      status: "error",
      errorKind: "invalid_structured_result",
      validation: {
        structured: {
          ok: false,
          expectedKeys: ["status", "summary"],
        },
      },
    });
    expect(callGatewayMock.mock.calls.filter((call) => call[0]?.method === "agent")).toHaveLength(1);
  });

  it("fails when the target path was not touched on disk", async () => {
    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const request = opts as { method?: string };
      if (request.method === "agent") {
        return { runId: "run-2", status: "accepted" };
      }
      if (request.method === "agent.wait") {
        return { status: "ok" };
      }
      if (request.method === "chat.history") {
        return {
          messages: [
            {
              role: "assistant",
              content: [{ type: "text", text: "fixed" }],
            },
          ],
        };
      }
      throw new Error(`unexpected method: ${String(request.method)}`);
    });

    const tool = getSessionsSendTool();
    const result = await tool.execute("call-write-miss", {
      sessionKey: "main",
      message: "fix target file",
      timeoutSeconds: 1,
      expectedPaths: [relativeTargetPath],
    });

    expect(result.details).toMatchObject({
      status: "error",
      errorKind: "target_not_touched",
      observedChangedFiles: [],
    });
    expect(callGatewayMock.mock.calls.filter((call) => call[0]?.method === "agent")).toHaveLength(1);
  });

  it("accepts runs that really change the expected target path", async () => {
    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const request = opts as { method?: string };
      if (request.method === "agent") {
        return { runId: "run-3", status: "accepted" };
      }
      if (request.method === "agent.wait") {
        await fs.writeFile(targetPath, "def clamp(v):\n    return max(0, v)\n", "utf-8");
        return { status: "ok" };
      }
      if (request.method === "chat.history") {
        return {
          messages: [
            {
              role: "assistant",
              content: [{ type: "text", text: '{"status":"ok","summary":"patched"}' }],
            },
          ],
        };
      }
      if (request.method === "sessions.get") {
        return {};
      }
      if (request.method === "send") {
        return { messageId: "m-1" };
      }
      return {};
    });

    const tool = getSessionsSendTool();
    const result = await tool.execute("call-write-ok", {
      sessionKey: "main",
      message: "fix target file",
      timeoutSeconds: 1,
      expectsJson: true,
      expectedKeys: ["status", "summary"],
      expectedPaths: [relativeTargetPath],
    });

    expect(result.details).toMatchObject({
      status: "ok",
      observedChangedFiles: [relativeTargetPath],
      validation: {
        structured: {
          ok: true,
          expectedKeys: ["status", "summary"],
        },
        write: {
          ok: true,
          expectedPaths: [relativeTargetPath],
        },
      },
    });
    const agentCall = callGatewayMock.mock.calls.find((call) => call[0]?.method === "agent")?.[0] as
      | { params?: { extraSystemPrompt?: string } }
      | undefined;
    expect(agentCall?.params?.extraSystemPrompt).toContain("[OMEGA Local Edit Contract]");
    expect(agentCall?.params?.extraSystemPrompt).toContain("[OMEGA Session Self]");
    expect(agentCall?.params?.extraSystemPrompt).toContain("[OMEGA Input Interpretation]");
    expect(agentCall?.params?.extraSystemPrompt).toContain("[OMEGA Outcome Model]");
    expect(agentCall?.params?.extraSystemPrompt).toContain(relativeTargetPath);
    expect(agentCall?.params?.extraSystemPrompt).toContain("[OMEGA Structured Output Contract]");
  });

  it("feeds prior verified failures back into the next prompt for the same session", async () => {
    let runCount = 0;
    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const request = opts as { method?: string };
      if (request.method === "agent") {
        runCount += 1;
        return { runId: `run-${runCount}`, status: "accepted" };
      }
      if (request.method === "agent.wait") {
        return { status: "ok" };
      }
      if (request.method === "chat.history") {
        if (runCount <= 1) {
          return {
            messages: [
              {
                role: "assistant",
                content: [{ type: "text", text: '{"status":"ok"}' }],
              },
            ],
          };
        }
        return {
          messages: [
            {
              role: "assistant",
              content: [{ type: "text", text: '{"status":"ok","summary":"patched"}' }],
            },
          ],
        };
      }
      throw new Error(`unexpected method: ${String(request.method)}`);
    });

    const tool = getSessionsSendTool();
    const first = await tool.execute("call-first", {
      sessionKey: "main",
      message: "return json",
      timeoutSeconds: 1,
      expectsJson: true,
      expectedKeys: ["status", "summary"],
    });
    expect(first.details).toMatchObject({
      status: "error",
      errorKind: "invalid_structured_result",
    });

    await tool.execute("call-second", {
      sessionKey: "main",
      message: "return json again",
      timeoutSeconds: 1,
      expectsJson: true,
      expectedKeys: ["status", "summary"],
    });

    const agentCalls = callGatewayMock.mock.calls.filter((call) => call[0]?.method === "agent");
    expect(agentCalls).toHaveLength(2);
    const secondAgentCall = agentCalls[1]?.[0] as
      | { params?: { extraSystemPrompt?: string } }
      | undefined;
    expect(secondAgentCall?.params?.extraSystemPrompt).toContain("[OMEGA Session Timeline]");
    expect(secondAgentCall?.params?.extraSystemPrompt).toContain("[OMEGA Input Interpretation]");
    expect(secondAgentCall?.params?.extraSystemPrompt).toContain("Interaction kind: verification_request");
    expect(secondAgentCall?.params?.extraSystemPrompt).toContain("invalid_structured_result");
    expect(secondAgentCall?.params?.extraSystemPrompt).toContain("Return exactly one JSON object");
  });
});
