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

describe("omega vs parent empirical comparison", () => {
  let workspaceRoot = "";
  let fileA = "";
  let fileB = "";
  let relA = "";
  let relB = "";

  beforeEach(async () => {
    callGatewayMock.mockReset();
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openskynet-omega-vs-parent-"));
    relA = path.join("workspace", "hard_probe", "range_tools.py").split(path.sep).join("/");
    relB = path.join("workspace", "hard_probe", "test_range_tools.py").split(path.sep).join("/");
    fileA = path.join(workspaceRoot, relA);
    fileB = path.join(workspaceRoot, relB);
    await fs.mkdir(path.dirname(fileA), { recursive: true });
    await fs.writeFile(fileA, "def clamp(v):\n    return v\n", "utf-8");
    await fs.writeFile(fileB, "def test_placeholder():\n    assert True\n", "utf-8");
  });

  afterEach(async () => {
    if (workspaceRoot) {
      await fs.rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  function getTool(name: string) {
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
  }

  it("structured analysis: omega rejects malformed JSON that the parent route would accept", async () => {
    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const request = opts as { method?: string };
      if (request.method === "agent") {
        return { runId: "run-analysis", status: "accepted" };
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

    const parentResult = await getTool("sessions_send").execute("call-parent-analysis", {
      sessionKey: "main",
      message: "resume el archivo y responde JSON",
      timeoutSeconds: 1,
    });
    const omegaResult = await getTool("omega_work").execute("call-omega-analysis", {
      task: "resume el archivo y responde JSON",
      sessionKey: "main",
      timeoutSeconds: 1,
      expectsJson: true,
      expectedKeys: ["status", "summary"],
    });

    expect(parentResult.details).toMatchObject({
      status: "ok",
      reply: '{"status":"ok"}',
    });
    expect(omegaResult.details).toMatchObject({
      route: "omega_delegate",
      status: "error",
      errorKind: "invalid_structured_result",
    });
  });

  it("reasoning boundary: omega preserves the same valid answer instead of becoming smarter than the parent route", async () => {
    const validReply = JSON.stringify({
      status: "ok",
      summary: "Encontrado cuello en el router de memoria local; falta separar lectura y escritura.",
      confidence: 0.71,
    });

    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const request = opts as { method?: string };
      if (request.method === "agent") {
        return { runId: "run-reasoning-boundary", status: "accepted" };
      }
      if (request.method === "agent.wait") {
        return { status: "ok" };
      }
      if (request.method === "chat.history") {
        return {
          messages: [
            {
              role: "assistant",
              content: [{ type: "text", text: validReply }],
            },
          ],
        };
      }
      throw new Error(`unexpected method: ${String(request.method)}`);
    });

    const parentResult = await getTool("sessions_send").execute("call-parent-reasoning", {
      sessionKey: "main",
      message: "analiza la arquitectura y responde JSON",
      timeoutSeconds: 1,
    });
    const omegaResult = await getTool("omega_work").execute("call-omega-reasoning", {
      task: "analiza la arquitectura y responde JSON",
      sessionKey: "main",
      timeoutSeconds: 1,
      expectsJson: true,
      expectedKeys: ["status", "summary", "confidence"],
    });

    expect(parentResult.details).toMatchObject({
      status: "ok",
      reply: validReply,
    });
    expect(omegaResult.details).toMatchObject({
      route: "omega_delegate",
      status: "ok",
      reply: validReply,
      validation: {
        structured: {
          ok: true,
          expectedKeys: ["status", "summary", "confidence"],
        },
      },
    });
  });

  it("code task with no disk delta: omega rejects a false success that parent spawn accepts", async () => {
    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const request = opts as { method?: string };
      if (request.method === "sessions.patch") {
        return { ok: true };
      }
      if (request.method === "agent") {
        return { runId: "run-no-delta", status: "accepted" };
      }
      if (request.method === "agent.wait") {
        return { status: "ok" };
      }
      if (request.method === "chat.history") {
        return {
          messages: [
            {
              role: "assistant",
              content: [{ type: "text", text: "patched" }],
            },
          ],
        };
      }
      return {};
    });

    const parentResult = await getTool("sessions_spawn").execute("call-parent-code", {
      task: "arregla el modulo",
      runTimeoutSeconds: 1,
    });
    const omegaResult = await getTool("omega_work").execute("call-omega-code", {
      task: "arregla el modulo",
      isolated: true,
      timeoutSeconds: 1,
      expectedPaths: [relA],
    });

    expect(parentResult.details).toMatchObject({
      status: "accepted",
      runId: "run-no-delta",
    });
    expect(omegaResult.details).toMatchObject({
      route: "sessions_spawn",
      status: "error",
      errorKind: "target_not_touched",
      observedChangedFiles: [],
    });
  });

  it("real multi-file fix: omega returns verified success while parent only returns accepted", async () => {
    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const request = opts as { method?: string };
      if (request.method === "sessions.patch") {
        return { ok: true };
      }
      if (request.method === "agent") {
        return { runId: "run-real-fix", status: "accepted" };
      }
      if (request.method === "agent.wait") {
        await fs.writeFile(fileA, "def clamp(v):\n    return max(0, v)\n", "utf-8");
        await fs.writeFile(fileB, "def test_placeholder():\n    assert clamp(-1) == 0\n", "utf-8");
        return { status: "ok" };
      }
      if (request.method === "chat.history") {
        return {
          messages: [
            {
              role: "assistant",
              content: [{ type: "text", text: '{"status":"ok","summary":"patched both files"}' }],
            },
          ],
        };
      }
      return {};
    });

    const parentResult = await getTool("sessions_spawn").execute("call-parent-real", {
      task: "arregla modulo y test",
      runTimeoutSeconds: 1,
    });
    const omegaResult = await getTool("omega_work").execute("call-omega-real", {
      task: "arregla modulo y test",
      isolated: true,
      timeoutSeconds: 1,
      expectsJson: true,
      expectedKeys: ["status", "summary"],
      expectedPaths: [relA, relB],
    });

    expect(parentResult.details).toMatchObject({
      status: "accepted",
      runId: "run-real-fix",
    });
    expect((parentResult.details as { observedChangedFiles?: unknown }).observedChangedFiles).toBeUndefined();
    expect(omegaResult.details).toMatchObject({
      route: "sessions_spawn",
      status: "ok",
      runId: "run-real-fix",
      observedChangedFiles: [relA, relB],
      validation: {
        structured: {
          ok: true,
          expectedKeys: ["status", "summary"],
        },
        write: {
          ok: true,
          expectedPaths: [relA, relB],
        },
      },
    });
  });

  it("partial multi-file fix: omega rejects a run that only touched one of the required targets", async () => {
    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const request = opts as { method?: string };
      if (request.method === "sessions.patch") {
        return { ok: true };
      }
      if (request.method === "agent") {
        return { runId: "run-partial-fix", status: "accepted" };
      }
      if (request.method === "agent.wait") {
        await fs.writeFile(fileA, "def clamp(v):\n    return max(0, v)\n", "utf-8");
        return { status: "ok" };
      }
      if (request.method === "chat.history") {
        return {
          messages: [
            {
              role: "assistant",
              content: [{ type: "text", text: '{"status":"ok","summary":"patched one file"}' }],
            },
          ],
        };
      }
      return {};
    });

    const parentResult = await getTool("sessions_spawn").execute("call-parent-partial", {
      task: "arregla modulo y test",
      runTimeoutSeconds: 1,
    });
    const omegaResult = await getTool("omega_work").execute("call-omega-partial", {
      task: "arregla modulo y test",
      isolated: true,
      timeoutSeconds: 1,
      expectsJson: true,
      expectedKeys: ["status", "summary"],
      expectedPaths: [relA, relB],
    });

    expect(parentResult.details).toMatchObject({
      status: "accepted",
      runId: "run-partial-fix",
    });
    expect(omegaResult.details).toMatchObject({
      route: "sessions_spawn",
      status: "error",
      errorKind: "missing_target_writes",
      observedChangedFiles: [relA],
      validation: {
        write: {
          missingExpectedPaths: [relB],
        },
      },
    });
  });

  it("pre-existing file mutation is not credited as a fresh write delta", async () => {
    await fs.writeFile(fileA, "def clamp(v):\n    return max(0, v)\n", "utf-8");

    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const request = opts as { method?: string };
      if (request.method === "sessions.patch") {
        return { ok: true };
      }
      if (request.method === "agent") {
        return { runId: "run-stale-delta", status: "accepted" };
      }
      if (request.method === "agent.wait") {
        return { status: "ok" };
      }
      if (request.method === "chat.history") {
        return {
          messages: [
            {
              role: "assistant",
              content: [{ type: "text", text: '{"status":"ok","summary":"already fixed"}' }],
            },
          ],
        };
      }
      return {};
    });

    const parentResult = await getTool("sessions_spawn").execute("call-parent-stale", {
      task: "arregla modulo",
      runTimeoutSeconds: 1,
    });
    const omegaResult = await getTool("omega_work").execute("call-omega-stale", {
      task: "arregla modulo",
      isolated: true,
      timeoutSeconds: 1,
      expectsJson: true,
      expectedKeys: ["status", "summary"],
      expectedPaths: [relA],
    });

    expect(parentResult.details).toMatchObject({
      status: "accepted",
      runId: "run-stale-delta",
    });
    expect(omegaResult.details).toMatchObject({
      route: "sessions_spawn",
      status: "error",
      errorKind: "target_not_touched",
      observedChangedFiles: [],
    });
  });
});
