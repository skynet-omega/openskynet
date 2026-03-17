import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "./test-helpers/fast-core-tools.js";
import {
  getCallGatewayMock,
  getGatewayMethods,
  getSessionsSpawnTool,
  resetSessionsSpawnConfigOverride,
  setSessionsSpawnConfigOverride,
} from "./openclaw-tools.subagents.sessions-spawn.test-harness.js";
import { resetSubagentRegistryForTests } from "./subagent-registry.js";

const callGatewayMock = getCallGatewayMock();

describe("sessions_spawn validation", () => {
  let workspaceRoot = "";
  let targetPath = "";
  let relativeTargetPath = "";

  beforeEach(async () => {
    resetSubagentRegistryForTests();
    resetSessionsSpawnConfigOverride();
    callGatewayMock.mockReset();
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openskynet-sessions-spawn-"));
    relativeTargetPath = path.join("workspace", "manual_code_probe", "range_tools.py").split(path.sep).join("/");
    targetPath = path.join(workspaceRoot, relativeTargetPath);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, "def clamp(v):\n    return v\n", "utf-8");
  });

  afterEach(async () => {
    resetSubagentRegistryForTests();
    if (workspaceRoot) {
      await fs.rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("exposes validation parameters on the schema", async () => {
    const tool = await getSessionsSpawnTool({ workspaceDir: workspaceRoot });
    const properties = (tool.parameters as { properties?: Record<string, unknown> }).properties ?? {};
    expect(properties.expectsJson).toBeDefined();
    expect(properties.expectedKeys).toBeDefined();
    expect(properties.expectedPaths).toBeDefined();
  });

  it("rejects validation for persistent session mode", async () => {
    const tool = await getSessionsSpawnTool({
      agentSessionKey: "main",
      agentChannel: "discord",
      workspaceDir: workspaceRoot,
    });

    const result = await tool.execute("call-session", {
      task: "do thing",
      thread: true,
      mode: "session",
      runTimeoutSeconds: 1,
      expectedPaths: [relativeTargetPath],
    });

    expect(result.details).toMatchObject({
      status: "error",
      errorKind: "validation_requires_run_mode",
    });
    expect(callGatewayMock).not.toHaveBeenCalled();
  });

  it("rejects validation without a positive timeout", async () => {
    setSessionsSpawnConfigOverride({
      session: { mainKey: "main", scope: "per-sender" },
      agents: { defaults: { subagents: { runTimeoutSeconds: 0 } } },
    });

    const tool = await getSessionsSpawnTool({
      agentSessionKey: "main",
      agentChannel: "discord",
      workspaceDir: workspaceRoot,
    });

    const result = await tool.execute("call-timeout", {
      task: "do thing",
      expectedPaths: [relativeTargetPath],
    });

    expect(result.details).toMatchObject({
      status: "error",
      errorKind: "validation_requires_timeout",
    });
    expect(callGatewayMock).not.toHaveBeenCalled();
  });

  it("returns validated success for one-shot subagent runs", async () => {
    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const request = opts as { method?: string; params?: Record<string, unknown> };
      if (request.method === "sessions.patch") {
        return { ok: true };
      }
      if (request.method === "agent") {
        const sessionKey = typeof request.params?.sessionKey === "string" ? request.params.sessionKey : "";
        if (typeof request.params?.lane === "string" && request.params.lane === "subagent") {
          return { runId: "run-1", status: "accepted", sessionKey };
        }
        return { runId: "run-parent", status: "accepted" };
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
      return {};
    });

    const tool = await getSessionsSpawnTool({
      agentSessionKey: "main",
      agentChannel: "discord",
      workspaceDir: workspaceRoot,
    });

    const result = await tool.execute("call-ok", {
      task: "patch file",
      runTimeoutSeconds: 1,
      expectsJson: true,
      expectedKeys: ["status", "summary"],
      expectedPaths: [relativeTargetPath],
    });

    expect(result.details).toMatchObject({
      status: "ok",
      runId: "run-1",
      mode: "run",
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
    expect(getGatewayMethods().filter((method) => method === "agent.wait").length).toBeGreaterThanOrEqual(1);
    const agentCall = callGatewayMock.mock.calls.find((call) => call[0]?.method === "agent")?.[0] as
      | { params?: { lane?: string; extraSystemPrompt?: string } }
      | undefined;
    expect(agentCall?.params?.lane).toBe("subagent");
    expect(agentCall?.params?.extraSystemPrompt).toContain("[OMEGA Input Interpretation]");
    expect(agentCall?.params?.extraSystemPrompt).toContain("[OMEGA Outcome Model]");
    expect(agentCall?.params?.extraSystemPrompt).toContain("[OMEGA Local Edit Contract]");
    expect(agentCall?.params?.extraSystemPrompt).toContain(relativeTargetPath);
    expect(agentCall?.params?.extraSystemPrompt).toContain("[OMEGA Structured Output Contract]");
  });

  it("rejects one-shot subagent runs that do not touch the expected file", async () => {
    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const request = opts as { method?: string; params?: Record<string, unknown> };
      if (request.method === "sessions.patch") {
        return { ok: true };
      }
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
              content: [{ type: "text", text: "done" }],
            },
          ],
        };
      }
      return {};
    });

    const tool = await getSessionsSpawnTool({
      agentSessionKey: "main",
      agentChannel: "discord",
      workspaceDir: workspaceRoot,
    });

    const result = await tool.execute("call-miss", {
      task: "patch file",
      runTimeoutSeconds: 1,
      expectedPaths: [relativeTargetPath],
    });

    expect(result.details).toMatchObject({
      status: "error",
      errorKind: "target_not_touched",
      runId: "run-2",
      observedChangedFiles: [],
    });
  });
});
