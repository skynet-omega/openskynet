import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "./test-helpers/fast-core-tools.js";
import type { OpenSkynetConfig } from "../config/config.js";
import type { HeartbeatDeps } from "../infra/heartbeat-runner.js";
import {
  getCallGatewayMock,
  getSessionsSpawnTool,
  resetSessionsSpawnConfigOverride,
} from "./openclaw-tools.subagents.sessions-spawn.test-harness.js";
import { resetSubagentRegistryForTests } from "./subagent-registry.js";

const callGatewayMock = getCallGatewayMock();

function createHeartbeatDeps(
  sendWhatsApp: NonNullable<HeartbeatDeps["sendWhatsApp"]>,
  nowMs = 0,
): HeartbeatDeps {
  return {
    sendWhatsApp,
    getQueueSize: () => 0,
    nowMs: () => nowMs,
    webAuthExists: async () => true,
    hasActiveWebListener: () => true,
  };
}

describe("parent recovery baseline", () => {
  let workspaceRoot = "";
  let storePath = "";
  let targetPath = "";
  let relativeTargetPath = "";

  beforeEach(async () => {
    resetSubagentRegistryForTests();
    resetSessionsSpawnConfigOverride();
    callGatewayMock.mockReset();
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-parent-recovery-"));
    storePath = path.join(workspaceRoot, "sessions.json");
    relativeTargetPath = path
      .join("workspace", "hard_probe", "range_tools.py")
      .split(path.sep)
      .join("/");
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

  it("does not expose validated write-recovery parameters on sessions_spawn", async () => {
    const tool = await getSessionsSpawnTool({
      agentSessionKey: "main",
      agentChannel: "discord",
      workspaceDir: workspaceRoot,
    });

    const properties =
      (tool.parameters as { properties?: Record<string, unknown> }).properties ?? {};

    expect(properties.expectsJson).toBeUndefined();
    expect(properties.expectedKeys).toBeUndefined();
    expect(properties.expectedPaths).toBeUndefined();
  });

  it("accepts a false-success spawn and heartbeat cannot resume it without re-entering the model", async () => {
    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const request = opts as { method?: string };
      if (request.method === "sessions.patch") {
        return { ok: true };
      }
      if (request.method === "agent") {
        return { runId: "run-parent-1", status: "accepted" };
      }
      if (request.method === "agent.wait") {
        return { status: "ok" };
      }
      if (request.method === "chat.history") {
        return {
          messages: [
            {
              role: "assistant",
              content: [{ type: "text", text: "patched without touching disk" }],
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

    const spawnResult = await tool.execute("call-parent-false-success", {
      task: "arregla solo el modulo",
      runTimeoutSeconds: 1,
    });

    expect(spawnResult.details).toMatchObject({
      status: "accepted",
      runId: "run-parent-1",
      mode: "run",
    });
    expect(await fs.readFile(targetPath, "utf-8")).toBe("def clamp(v):\n    return v\n");

    const cfg: OpenSkynetConfig = {
      agents: {
        defaults: {
          workspace: workspaceRoot,
          heartbeat: {
            every: "5m",
            target: "whatsapp",
          },
        },
      },
      channels: {
        whatsapp: {
          allowFrom: ["*"],
        },
      },
      session: {
        store: storePath,
      },
    };
    const { HEARTBEAT_TOKEN } = await import("../auto-reply/tokens.js");
    const replyModule = await import("../auto-reply/reply.js");
    const { resolveMainSessionKey } = await import("../config/sessions.js");
    const { runHeartbeatOnce } = await import("../infra/heartbeat-runner.js");
    const sessionKey = resolveMainSessionKey(cfg);
    await fs.writeFile(
      storePath,
      JSON.stringify({
        [sessionKey]: {
          sessionId: "sid-parent",
          updatedAt: Date.now(),
          lastChannel: "whatsapp",
          lastTo: "120363401234567890@g.us",
        },
      }),
      "utf-8",
    );

    const replySpy = vi.spyOn(replyModule, "getReplyFromConfig");
    const sendWhatsApp = vi.fn<NonNullable<HeartbeatDeps["sendWhatsApp"]>>().mockResolvedValue({
      messageId: "msg-parent-1",
      toJid: "120363401234567890@g.us",
    });

    try {
      replySpy.mockResolvedValue([{ text: HEARTBEAT_TOKEN }]);

      const heartbeatResult = await runHeartbeatOnce({
        cfg,
        deps: createHeartbeatDeps(sendWhatsApp),
      });

      expect(heartbeatResult.status).toBe("ran");
      expect(replySpy).toHaveBeenCalledTimes(1);
      const heartbeatCtx = replySpy.mock.calls[0]?.[0] as { Body?: string } | undefined;
      expect(heartbeatCtx?.Body).not.toContain("resume_interrupted_goal");
      expect(heartbeatCtx?.Body).not.toContain(relativeTargetPath);
      expect(await fs.readFile(targetPath, "utf-8")).toBe("def clamp(v):\n    return v\n");
    } finally {
      replySpy.mockRestore();
    }
  });
});
