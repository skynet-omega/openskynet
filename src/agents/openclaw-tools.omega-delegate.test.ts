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
        agentToAgent: { maxPingPongTurns: 2 },
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

describe("omega_delegate tool", () => {
  let workspaceRoot = "";
  let targetPath = "";
  let relativeTargetPath = "";

  beforeEach(async () => {
    callGatewayMock.mockReset();
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openskynet-omega-delegate-"));
    relativeTargetPath = path.join("workspace", "manual_code_probe", "range_tools.py").split(path.sep).join("/");
    targetPath = path.join(workspaceRoot, relativeTargetPath);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, "def clamp(v):\n    return v\n", "utf-8");
  });

  afterEach(async () => {
    if (workspaceRoot) {
      await fs.rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  function getOmegaDelegateTool() {
    const tool = createOpenClawTools({
      agentSessionKey: "main",
      agentChannel: "discord",
      workspaceDir: workspaceRoot,
    }).find((candidate) => candidate.name === "omega_delegate");
    expect(tool).toBeDefined();
    if (!tool) {
      throw new Error("missing omega_delegate tool");
    }
    return tool;
  }

  it("exposes validation parameters on the tool schema", () => {
    const tool = getOmegaDelegateTool();
    const properties = (tool.parameters as { properties?: Record<string, unknown> }).properties ?? {};
    expect(properties.expectsJson).toBeDefined();
    expect(properties.expectedKeys).toBeDefined();
    expect(properties.expectedPaths).toBeDefined();
  });

  it("runs a validated task without announce or ping-pong delivery", async () => {
    const calls: Array<{ method?: string; params?: unknown }> = [];
    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const request = opts as { method?: string; params?: unknown };
      calls.push(request);
      if (request.method === "agent") {
        return { runId: "run-omega", status: "accepted" };
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
      throw new Error(`unexpected method: ${String(request.method)}`);
    });

    const tool = getOmegaDelegateTool();
    const result = await tool.execute("call-omega", {
      sessionKey: "main",
      message: "patch file",
      timeoutSeconds: 1,
      expectsJson: true,
      expectedKeys: ["status", "summary"],
      expectedPaths: [relativeTargetPath],
    });

    expect(result.details).toMatchObject({
      status: "ok",
      delivery: { status: "disabled", mode: "none" },
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
    expect(calls.filter((call) => call.method === "agent")).toHaveLength(1);
    expect(calls.filter((call) => call.method === "agent.wait")).toHaveLength(1);
    expect(calls.filter((call) => call.method === "chat.history")).toHaveLength(1);
    expect(calls.filter((call) => call.method === "send")).toHaveLength(0);
  });
});
