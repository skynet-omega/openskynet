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
  buildOmegaHeartbeatPrompt,
  deriveOmegaInterruptedGoalRecovery,
  loadOmegaSelfTimeKernel,
  recordOmegaSessionOutcome,
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

describe("omega vs parent recovery after interruption", () => {
  it("keeps a recoverable active goal across restart and completes it without re-passing validation", async () => {
    const parentRoot = await createWorkspaceRoot("openskynet-parent-recovery-");
    const omegaRoot = await createWorkspaceRoot("openskynet-omega-recovery-");
    const parent = createHarness(parentRoot);
    const omega = createHarness(omegaRoot);
    await parent.prepare();
    await omega.prepare();

    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const request = opts as { method?: string };
      if (request.method === "sessions.patch") {
        return { ok: true };
      }
      if (request.method === "agent") {
        return { runId: "run-interrupted", status: "accepted" };
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

    const parentFirst = await parent.getTool("sessions_spawn").execute("parent-first", {
      task: "arregla solo el modulo",
      runTimeoutSeconds: 1,
    });
    const omegaFirst = await omega.getTool("omega_work").execute("omega-first", {
      task: "arregla solo el modulo",
      sessionKey: "main",
      timeoutSeconds: 1,
      expectedPaths: [omega.relA],
    });

    const interruptedKernel = await loadOmegaSelfTimeKernel({
      workspaceRoot: omegaRoot,
      sessionKey: "main",
    });
    const recovery = deriveOmegaInterruptedGoalRecovery({
      kernel: interruptedKernel,
    });
    const parentWake = await buildOmegaHeartbeatPrompt({
      workspaceRoot: parentRoot,
      sessionKey: "main",
    });
    const omegaWake = await buildOmegaHeartbeatPrompt({
      workspaceRoot: omegaRoot,
      sessionKey: "main",
    });

    expect(parentFirst.details).toMatchObject({
      status: "accepted",
    });
    expect(omegaFirst.details).toMatchObject({
      route: "sessions_spawn",
      initialRoute: "omega_delegate",
      status: "error",
      errorKind: "target_not_touched",
    });
    expect(recovery).toMatchObject({
      goalTask: "arregla solo el modulo",
      remainingTargets: [omega.relA],
      suggestedRoute: "sessions_spawn",
      reason: "verified_write_failure_after_restart",
    });
    expect(parentWake).toBeUndefined();
    expect(omegaWake).toContain("Wake action: abort_interrupted_goal");
    expect(omegaWake).toContain(`Blocked verified targets: ${omega.relA}`);

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
        await fs.writeFile(omega.fileA, "def clamp(v):\n    return max(0, v)\n", "utf-8");
        return { status: "ok" };
      }
      if (request.method === "chat.history") {
        return {
          messages: [
            {
              role: "assistant",
              content: [{ type: "text", text: "recovered from persisted kernel" }],
            },
          ],
        };
      }
      throw new Error(`unexpected method: ${String(request.method)}`);
    });

    const omegaRecovered = await omega.getTool("omega_work").execute("omega-recovered", {
      task: "arregla solo el modulo",
      sessionKey: "main",
      timeoutSeconds: 1,
    });
    const recoveredKernel = await loadOmegaSelfTimeKernel({
      workspaceRoot: omegaRoot,
      sessionKey: "main",
    });

    expect(omegaRecovered.details).toMatchObject({
      route: "sessions_spawn",
      resumedFromKernel: true,
      recoveryReason: "verified_write_failure_after_restart",
      recoverySuggestedRoute: "sessions_spawn",
      status: "ok",
      observedChangedFiles: [omega.relA],
      wakeAction: {
        kind: "heartbeat_ok",
      },
    });
    expect(recoveredKernel?.activeGoalId).toBeUndefined();
    expect(await fs.readFile(parent.fileA, "utf-8")).toBe("def clamp(v):\n    return v\n");
    expect(await fs.readFile(omega.fileA, "utf-8")).toBe(
      "def clamp(v):\n    return max(0, v)\n",
    );
  });

  it("completes a zero-input recovery loop exclusively through runHeartbeatOnce", async () => {
    const omegaRoot = await createWorkspaceRoot("openskynet-omega-zero-input-");
    const omega = createHarness(omegaRoot);
    await omega.prepare();
    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const request = opts as {
        method?: string;
        params?: { message?: string, runId?: string };
      };
      if (request.method === "sessions.patch") {
        return { ok: true };
      }
      if (request.method === "agent") {
        expect(request.params?.message).toContain("[OMEGA recovery]");
        return { runId: "run-recovered", status: "accepted" };
      }
      if (request.method === "agent.wait") {
        await fs.writeFile(omega.fileA, "def clamp(v):\n    return max(0, v)\n", "utf-8");
        return { status: "ok" };
      }
      if (request.method === "chat.history") {
        return {
          messages: [
            {
              role: "assistant",
              content: [{ type: "text", text: "recovered from persisted kernel" }],
            },
          ],
        };
      }
      throw new Error(`unexpected method: ${String(request.method)}`);
    });
    await recordOmegaSessionOutcome({
      workspaceRoot: omegaRoot,
      sessionKey: "agent:main:main",
      task: "arregla solo el modulo",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: [omega.relA],
      },
      outcome: {
        status: "error",
        errorKind: "target_not_touched",
        observedChangedFiles: [],
        writeOk: false,
      },
    });

    const sessionStorePath = path.join(omegaRoot, "sessions.json");
    await fs.writeFile(sessionStorePath, JSON.stringify({
      "agent:main:main": {
        sessionId: "sid",
        updatedAt: Date.now() - 120000,
        lastChannel: "whatsapp",
        lastTo: "120363401234567890@g.us",
      }
    }));

    const cfg = {
      agents: {
        defaults: {
          workspace: omegaRoot,
          heartbeat: { every: "1m", target: "whatsapp" },
        },
      },
      session: { store: sessionStorePath, mainKey: "main" },
      channels: { whatsapp: { allowFrom: ["*"] } },
    };

    const replySpy = vi.spyOn(replyModule, "getReplyFromConfig");
    const sendWhatsApp = vi.fn().mockResolvedValue({ messageId: "m1", toJid: "jid" });
    replySpy.mockResolvedValue({ text: "should-not-run" });

    const res = await runHeartbeatOnce({
      cfg: cfg as any,
      deps: {
        sendWhatsApp,
        getQueueSize: () => 0,
        nowMs: () => Date.now(),
        webAuthExists: async () => true,
        hasActiveWebListener: () => true,
      } as any,
    });

    expect(res.status).toBe("ran");
    expect(replySpy).not.toHaveBeenCalled();

    const recoveredKernel = await loadOmegaSelfTimeKernel({
      workspaceRoot: omegaRoot,
      sessionKey: "agent:main:main",
    });
    expect(recoveredKernel?.activeGoalId).toBeUndefined();
    expect(await fs.readFile(omega.fileA, "utf-8")).toBe(
      "def clamp(v):\n    return max(0, v)\n",
    );
    
    replySpy.mockRestore();
  });
});
