import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

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
import {
  loadOmegaSelfTimeKernel,
  loadOmegaTaskTransactions,
} from "../omega/index.js";
import * as replyModule from "../auto-reply/reply.js";
import { runHeartbeatOnce } from "../infra/heartbeat-runner.js";

const tmpDirs: string[] = [];

async function createWorkspaceRoot(prefix: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tmpDirs.push(root);
  return root;
}

function createHarness(workspaceRoot: string) {
  const relA = path.join("workspace", "hard_probe", "range_tools.py").split(path.sep).join("/");
  const fileA = path.join(workspaceRoot, relA);

  return {
    relA,
    fileA,
    async prepare() {
      await fs.mkdir(path.dirname(fileA), { recursive: true });
      await fs.writeFile(fileA, "def clamp(v):\n    return v\n", "utf-8");
    },
    getTool(name: string) {
      const tool = createOpenClawTools({
        agentSessionKey: "main",
        agentChannel: "discord",
        workspaceDir: workspaceRoot,
      }).find((candidate) => candidate.name === name);
      expect(tool).toBeDefined();
      if (!tool) {
        throw new Error(`missing tool: ${name}`);
      }
      return tool;
    },
  };
}

afterEach(async () => {
  callGatewayMock.mockReset();
  await Promise.all(
    tmpDirs.splice(0, tmpDirs.length).map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
});

describe("omega fault injection", () => {
  it("persists a reroute transaction after a validated false success on omega_delegate", async () => {
    const workspaceRoot = await createWorkspaceRoot("openskynet-omega-fault-reroute-");
    const harness = createHarness(workspaceRoot);
    await harness.prepare();

    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const request = opts as { method?: string };
      if (request.method === "agent") {
        return { runId: "run-false-success", status: "accepted" };
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
      throw new Error(`unexpected method: ${String(request.method)}`);
    });

    const result = await harness.getTool("omega_delegate").execute("call-reroute", {
      message: "arregla solo el modulo",
      sessionKey: "main",
      timeoutSeconds: 1,
      expectedPaths: [harness.relA],
    });
    const transactions = await loadOmegaTaskTransactions({
      workspaceRoot,
      sessionKey: "main",
    });

    expect(result.details).toMatchObject({
      status: "error",
      errorKind: "target_not_touched",
      observedChangedFiles: [],
    });
    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toMatchObject({
      status: "active",
      attempts: [
        expect.objectContaining({
          route: "omega_delegate",
          status: "error",
          errorKind: "target_not_touched",
        }),
      ],
      nextRecoveryStep: {
        kind: "reroute",
        route: "sessions_spawn",
        remainingTargets: [harness.relA],
      },
    });
  });

  it("closes a persisted transaction through zero-input heartbeat recovery", async () => {
    const workspaceRoot = await createWorkspaceRoot("openskynet-omega-fault-heartbeat-");
    const harness = createHarness(workspaceRoot);
    await harness.prepare();

    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const request = opts as { method?: string };
      if (request.method === "agent") {
        return { runId: "run-initial", status: "accepted" };
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
      throw new Error(`unexpected method: ${String(request.method)}`);
    });

    const initial = await harness.getTool("omega_delegate").execute("call-initial", {
      message: "arregla solo el modulo",
      sessionKey: "main",
      timeoutSeconds: 1,
      expectedPaths: [harness.relA],
    });
    expect(initial.details).toMatchObject({
      status: "error",
      errorKind: "target_not_touched",
    });

    const storePath = path.join(workspaceRoot, "sessions.json");
    await fs.writeFile(
      storePath,
      JSON.stringify({
        "agent:main:main": {
          sessionId: "sid",
          updatedAt: Date.now() - 120000,
          lastChannel: "whatsapp",
          lastTo: "120363401234567890@g.us",
        },
      }),
      "utf-8",
    );

    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const request = opts as {
        method?: string;
        params?: { message?: string };
      };
      if (request.method === "sessions.patch") {
        return { ok: true };
      }
      if (request.method === "agent") {
        expect(request.params?.message).toContain("[OMEGA recovery]");
        return { runId: "run-recovered", status: "accepted" };
      }
      if (request.method === "agent.wait") {
        await fs.writeFile(harness.fileA, "def clamp(v):\n    return max(0, v)\n", "utf-8");
        return { status: "ok" };
      }
      if (request.method === "chat.history") {
        return {
          messages: [
            {
              role: "assistant",
              content: [{ type: "text", text: "recovered from persisted transaction" }],
            },
          ],
        };
      }
      throw new Error(`unexpected method: ${String(request.method)}`);
    });

    const cfg = {
      agents: {
        defaults: {
          workspace: workspaceRoot,
          heartbeat: { every: "1m", target: "whatsapp" },
        },
      },
      session: { store: storePath, mainKey: "main" },
      channels: { whatsapp: { allowFrom: ["*"] } },
    };
    const replySpy = vi.spyOn(replyModule, "getReplyFromConfig");
    replySpy.mockResolvedValue({ text: "should-not-run" });

    const res = await runHeartbeatOnce({
      cfg: cfg as never,
      deps: {
        sendWhatsApp: vi.fn().mockResolvedValue({ messageId: "m1", toJid: "jid" }),
        getQueueSize: () => 0,
        nowMs: () => Date.now(),
        webAuthExists: async () => true,
        hasActiveWebListener: () => true,
      },
    });

    const transactions = await loadOmegaTaskTransactions({
      workspaceRoot,
      sessionKey: "main",
    });
    const kernel = await loadOmegaSelfTimeKernel({
      workspaceRoot,
      sessionKey: "main",
    });

    expect(res.status).toBe("ran");
    expect(replySpy).not.toHaveBeenCalled();
    expect(await fs.readFile(harness.fileA, "utf-8")).toBe(
      "def clamp(v):\n    return max(0, v)\n",
    );
    expect(kernel?.activeGoalId).toBeUndefined();
    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toMatchObject({
      status: "completed",
      attempts: [
        expect.objectContaining({
          route: "omega_delegate",
          status: "error",
        }),
        expect.objectContaining({
          route: "sessions_spawn",
          status: "ok",
          trigger: "heartbeat",
          resumedFromKernel: true,
          observedChangedFiles: [harness.relA],
        }),
      ],
      nextRecoveryStep: {
        kind: "none",
        reason: "verified_success",
      },
    });

    replySpy.mockRestore();
  });

  it("aborts further autonomous recovery after repeated verified false success", async () => {
    const workspaceRoot = await createWorkspaceRoot("openskynet-omega-fault-abort-");
    const harness = createHarness(workspaceRoot);
    await harness.prepare();

    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const request = opts as { method?: string };
      if (request.method === "agent") {
        return { runId: "run-initial", status: "accepted" };
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
      throw new Error(`unexpected method: ${String(request.method)}`);
    });

    const initial = await harness.getTool("omega_delegate").execute("call-abort-initial", {
      message: "arregla solo el modulo",
      sessionKey: "main",
      timeoutSeconds: 1,
      expectedPaths: [harness.relA],
    });
    expect(initial.details).toMatchObject({
      status: "error",
      errorKind: "target_not_touched",
    });

    const storePath = path.join(workspaceRoot, "sessions.json");
    await fs.writeFile(
      storePath,
      JSON.stringify({
        "agent:main:main": {
          sessionId: "sid",
          updatedAt: Date.now() - 120000,
          lastChannel: "whatsapp",
          lastTo: "120363401234567890@g.us",
        },
      }),
      "utf-8",
    );

    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const request = opts as {
        method?: string;
        params?: { message?: string };
      };
      if (request.method === "sessions.patch") {
        return { ok: true };
      }
      if (request.method === "agent") {
        expect(request.params?.message).toContain("[OMEGA recovery]");
        return { runId: "run-recovery-fail", status: "accepted" };
      }
      if (request.method === "agent.wait") {
        return { status: "ok" };
      }
      if (request.method === "chat.history") {
        return {
          messages: [
            {
              role: "assistant",
              content: [{ type: "text", text: "claimed recovery without disk delta" }],
            },
          ],
        };
      }
      throw new Error(`unexpected method: ${String(request.method)}`);
    });

    const cfg = {
      agents: {
        defaults: {
          workspace: workspaceRoot,
          heartbeat: { every: "1m", target: "whatsapp" },
        },
      },
      session: { store: storePath, mainKey: "main" },
      channels: { whatsapp: { allowFrom: ["*"] } },
    };
    const replySpy = vi.spyOn(replyModule, "getReplyFromConfig");
    replySpy.mockResolvedValue({ text: "should-not-run" });

    const firstHeartbeat = await runHeartbeatOnce({
      cfg: cfg as never,
      deps: {
        sendWhatsApp: vi.fn().mockResolvedValue({ messageId: "m1", toJid: "jid" }),
        getQueueSize: () => 0,
        nowMs: () => Date.now(),
        webAuthExists: async () => true,
        hasActiveWebListener: () => true,
      },
    });

    const afterRecoveryAttempt = await loadOmegaTaskTransactions({
      workspaceRoot,
      sessionKey: "main",
    });

    expect(firstHeartbeat.status).toBe("ran");
    expect(replySpy).not.toHaveBeenCalled();
    expect(afterRecoveryAttempt).toHaveLength(1);
    expect(afterRecoveryAttempt[0]).toMatchObject({
      status: "active",
      attempts: [
        expect.objectContaining({
          route: "omega_delegate",
          status: "error",
        }),
        expect.objectContaining({
          route: "sessions_spawn",
          status: "error",
          trigger: "heartbeat",
          resumedFromKernel: true,
        }),
      ],
      nextRecoveryStep: {
        kind: "abort",
        reason: "failure_streak_too_high",
        route: "sessions_spawn",
        remainingTargets: [harness.relA],
      },
    });
    expect(await fs.readFile(harness.fileA, "utf-8")).toBe("def clamp(v):\n    return v\n");

    callGatewayMock.mockReset();
    callGatewayMock.mockImplementation(async (opts: unknown) => {
      throw new Error(`unexpected gateway call after abort: ${JSON.stringify(opts)}`);
    });

    const secondHeartbeat = await runHeartbeatOnce({
      cfg: cfg as never,
      deps: {
        sendWhatsApp: vi.fn().mockResolvedValue({ messageId: "m1", toJid: "jid" }),
        getQueueSize: () => 0,
        nowMs: () => Date.now(),
        webAuthExists: async () => true,
        hasActiveWebListener: () => true,
      },
    });

    expect(secondHeartbeat.status).toBe("ran");
    expect(replySpy).not.toHaveBeenCalled();
    expect(callGatewayMock).not.toHaveBeenCalled();

    replySpy.mockRestore();
  });
});
