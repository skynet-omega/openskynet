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
import { resolveOmegaRuntimeObserverArtifactPath } from "../omega/runtime-observer.js";
import { recordOmegaSessionOutcome } from "../omega/session-context.js";
import { createOpenClawTools } from "./openclaw-tools.js";

describe("omega_work hard tasks", () => {
  let workspaceRoot = "";
  let fileA = "";
  let fileB = "";
  let relA = "";
  let relB = "";

  beforeEach(async () => {
    callGatewayMock.mockReset();
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openskynet-omega-work-"));
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

  function getOmegaWorkTool(agentSessionKey = "main") {
    const tool = createOpenClawTools({
      agentSessionKey,
      agentChannel: "discord",
      workspaceDir: workspaceRoot,
    }).find((candidate) => candidate.name === "omega_work");
    expect(tool).toBeDefined();
    if (!tool) {
      throw new Error("missing omega_work");
    }
    return tool;
  }

  it("routes structured analysis to omega_delegate and rejects malformed output", async () => {
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

    const result = await getOmegaWorkTool().execute("call-analysis", {
      task: "resume el archivo y responde JSON",
      sessionKey: "main",
      timeoutSeconds: 1,
      expectsJson: true,
      expectedKeys: ["status", "summary"],
    });

    expect(result.details).toMatchObject({
      route: "omega_delegate",
      interactionKind: "verification_request",
      status: "error",
      errorKind: "invalid_structured_result",
      runId: "run-analysis",
      wakeAction: {
        kind: "heartbeat_ok",
      },
    });
  });

  it("defaults to the current requester session when sessionKey is omitted", async () => {
    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const request = opts as { method?: string };
      if (request.method === "agent") {
        return { runId: "run-current-session", status: "accepted" };
      }
      if (request.method === "agent.wait") {
        return { status: "ok" };
      }
      if (request.method === "chat.history") {
        return {
          messages: [
            {
              role: "assistant",
              content: [{ type: "text", text: '{"status":"ok","summary":"same session"}' }],
            },
          ],
        };
      }
      throw new Error(`unexpected method: ${String(request.method)}`);
    });

    const requesterSessionKey = "agent:ops:subagent:worker";
    const result = await getOmegaWorkTool(requesterSessionKey).execute("call-current-session", {
      task: "resume el archivo y responde JSON",
      timeoutSeconds: 1,
      expectsJson: true,
      expectedKeys: ["status", "summary"],
    });

    expect(result.details).toMatchObject({
      route: "omega_delegate",
      status: "ok",
      runId: "run-current-session",
    });
    const agentCall = callGatewayMock.mock.calls.find(
      (call) => (call[0] as { method?: string }).method === "agent",
    );
    expect(agentCall?.[0]).toMatchObject({
      method: "agent",
      params: { sessionKey: requesterSessionKey },
    });
  });

  it("keeps a validated single-target edit on omega_delegate", async () => {
    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const request = opts as { method?: string };
      if (request.method === "agent") {
        return { runId: "run-single-target", status: "accepted" };
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
      throw new Error(`unexpected method: ${String(request.method)}`);
    });

    const result = await getOmegaWorkTool().execute("call-single-target", {
      task: "arregla solo el modulo",
      sessionKey: "main",
      timeoutSeconds: 1,
      expectsJson: true,
      expectedKeys: ["status", "summary"],
      expectedPaths: [relA],
    });

    expect(result.details).toMatchObject({
      route: "omega_delegate",
      interactionKind: "mixed_turn",
      status: "ok",
      runId: "run-single-target",
      observedChangedFiles: [relA],
      validation: {
        structured: {
          ok: true,
          expectedKeys: ["status", "summary"],
        },
      },
    });
  });

  it("exposes a fresh runtime observer prior in omega_work results when available", async () => {
    await fs.mkdir(path.dirname(resolveOmegaRuntimeObserverArtifactPath(workspaceRoot)), {
      recursive: true,
    });
    await fs.writeFile(
      resolveOmegaRuntimeObserverArtifactPath(workspaceRoot),
      JSON.stringify(
        {
          updatedAt: Date.now(),
          status: "pass",
          accuracy: 0.82,
          majorityBaseline: 0.71,
          improvementOverBaseline: 0.12,
          trajectorySamples: 95,
          harvestedEpisodes: 97,
          lookback: 3,
          labelCoverage: { stall: 67, damage: 15, progress: 9, relief: 2, frustration: 2 },
        },
        null,
        2,
      ),
      "utf-8",
    );

    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const request = opts as { method?: string };
      if (request.method === "agent") {
        return { runId: "run-runtime-observer", status: "accepted" };
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
      throw new Error(`unexpected method: ${String(request.method)}`);
    });

    const result = await getOmegaWorkTool().execute("call-runtime-observer", {
      task: "arregla solo el modulo",
      sessionKey: "main",
      timeoutSeconds: 1,
      expectsJson: true,
      expectedKeys: ["status", "summary"],
      expectedPaths: [relA],
    });

    expect(result.details).toMatchObject({
      route: "omega_delegate",
      runtimeObserver: {
        freshness: "fresh",
        improvementOverBaseline: 0.12,
        trajectorySamples: 95,
        dominantLabel: "stall",
      },
    });
  });

  it("escalates a verified write failure from omega_delegate into one corrective sessions_spawn retry", async () => {
    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const request = opts as { method?: string };
      if (request.method === "sessions.patch") {
        return { ok: true };
      }
      if (request.method === "agent") {
        return { runId: "run-open-goal", status: "accepted" };
      }
      if (request.method === "agent.wait") {
        return { status: "ok" };
      }
      if (request.method === "chat.history") {
        return {
          messages: [
            {
              role: "assistant",
              content: [{ type: "text", text: '{"status":"ok","summary":"claimed patch"}' }],
            },
          ],
        };
      }
      throw new Error(`unexpected method: ${String(request.method)}`);
    });

    const result = await getOmegaWorkTool().execute("call-open-goal", {
      task: "arregla solo el modulo",
      sessionKey: "main",
      timeoutSeconds: 1,
      expectsJson: true,
      expectedKeys: ["status", "summary"],
      expectedPaths: [relA],
    });

    expect(result.details).toMatchObject({
      route: "sessions_spawn",
      initialRoute: "omega_delegate",
      retriedByOmega: true,
      status: "error",
      errorKind: "target_not_touched",
      wakeAction: {
        kind: "abort_interrupted_goal",
        reason: "failure_streak_too_high",
        goalTask: "arregla solo el modulo",
      },
    });
  });

  it("converts a false success detected on omega_delegate into a successful corrective isolated retry", async () => {
    let agentCalls = 0;
    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const request = opts as { method?: string };
      if (request.method === "sessions.patch") {
        return { ok: true };
      }
      if (request.method === "agent") {
        agentCalls += 1;
        return {
          runId: agentCalls === 1 ? "run-corrective-initial" : "run-corrective-retry",
          status: "accepted",
        };
      }
      if (request.method === "agent.wait") {
        if (agentCalls >= 2) {
          await fs.writeFile(fileA, "def clamp(v):\n    return max(0, v)\n", "utf-8");
        }
        return { status: "ok" };
      }
      if (request.method === "chat.history") {
        if (agentCalls === 1) {
          return {
            messages: [
              {
                role: "assistant",
                content: [{ type: "text", text: '{"status":"ok","summary":"claimed patch"}' }],
              },
            ],
          };
        }
        return {
          messages: [
            {
              role: "assistant",
              content: [{ type: "text", text: '{"status":"ok","summary":"patched on retry"}' }],
            },
          ],
        };
      }
      throw new Error(`unexpected method: ${String(request.method)}`);
    });

    const result = await getOmegaWorkTool().execute("call-corrective-retry", {
      task: "arregla solo el modulo",
      sessionKey: "main",
      timeoutSeconds: 1,
      expectsJson: true,
      expectedKeys: ["status", "summary"],
      expectedPaths: [relA],
    });

    expect(agentCalls).toBe(2);
    expect(result.details).toMatchObject({
      route: "sessions_spawn",
      initialRoute: "omega_delegate",
      retriedByOmega: true,
      status: "ok",
      runId: "run-corrective-retry",
      observedChangedFiles: [relA],
      validation: {
        structured: {
          ok: true,
          expectedKeys: ["status", "summary"],
        },
        write: {
          ok: true,
          expectedPaths: [relA],
          observedChangedFiles: [relA],
        },
      },
    });
  });

  it("routes isolated multi-file repair to sessions_spawn and validates both disk deltas", async () => {
    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const request = opts as { method?: string };
      if (request.method === "sessions.patch") {
        return { ok: true };
      }
      if (request.method === "agent") {
        return { runId: "run-isolated", status: "accepted" };
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

    const result = await getOmegaWorkTool().execute("call-isolated", {
      task: "arregla el modulo y su test",
      isolated: true,
      timeoutSeconds: 1,
      expectsJson: true,
      expectedKeys: ["status", "summary"],
      expectedPaths: [relA, relB],
    });

    expect(result.details).toMatchObject({
      route: "sessions_spawn",
      interactionKind: "mixed_turn",
      status: "ok",
      runId: "run-isolated",
      observedChangedFiles: [relA, relB],
      validation: {
        structured: {
          ok: true,
          expectedKeys: ["status", "summary"],
        },
      },
    });
  });

  it("routes validated multi-file repair to sessions_spawn even without isolated mode", async () => {
    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const request = opts as { method?: string };
      if (request.method === "sessions.patch") {
        return { ok: true };
      }
      if (request.method === "agent") {
        return { runId: "run-multifile", status: "accepted" };
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

    const result = await getOmegaWorkTool().execute("call-multifile", {
      task: "arregla el modulo y su test",
      timeoutSeconds: 1,
      expectsJson: true,
      expectedKeys: ["status", "summary"],
      expectedPaths: [relA, relB],
    });

    expect(result.details).toMatchObject({
      route: "sessions_spawn",
      interactionKind: "mixed_turn",
      status: "ok",
      runId: "run-multifile",
      observedChangedFiles: [relA, relB],
      validation: {
        structured: {
          ok: true,
          expectedKeys: ["status", "summary"],
        },
      },
    });
  });

  it("routes plain handoff to sessions_send without forcing validation", async () => {
    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const request = opts as { method?: string };
      if (request.method === "agent") {
        return { runId: "run-send", status: "accepted" };
      }
      throw new Error(`unexpected method: ${String(request.method)}`);
    });

    const result = await getOmegaWorkTool().execute("call-send", {
      task: "continua la conversacion con el worker",
      sessionKey: "main",
      timeoutSeconds: 0,
    });

    expect(result.details).toMatchObject({
      route: "sessions_send",
      interactionKind: "direct_instruction",
      status: "accepted",
      runId: "run-send",
    });
  });

  it("routes verification turns with timeout through omega_delegate even without explicit validation", async () => {
    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const request = opts as { method?: string };
      if (request.method === "agent") {
        return { runId: "run-verify", status: "accepted" };
      }
      if (request.method === "agent.wait") {
        return { status: "ok" };
      }
      if (request.method === "chat.history") {
        return {
          messages: [
            {
              role: "assistant",
              content: [{ type: "text", text: "checked the file and it still fails" }],
            },
          ],
        };
      }
      throw new Error(`unexpected method: ${String(request.method)}`);
    });

    const result = await getOmegaWorkTool().execute("call-verify", {
      task: "verify why the module still fails",
      sessionKey: "main",
      timeoutSeconds: 1,
    });

    expect(result.details).toMatchObject({
      route: "omega_delegate",
      interactionKind: "analysis_request",
      status: "ok",
      runId: "run-verify",
    });
  });

  it("reuses the latest verified structured result without another LLM call", async () => {
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "main",
      task: "resume el archivo y responde JSON",
      validation: {
        expectsJson: true,
        expectedKeys: ["status", "summary"],
        expectedPaths: [],
      },
      outcome: {
        status: "ok",
        structuredOk: true,
      },
      reply: '{"status":"ok","summary":"cached summary"}',
    });

    const result = await getOmegaWorkTool().execute("call-cached-analysis", {
      task: "resume el archivo y responde JSON",
      sessionKey: "main",
      timeoutSeconds: 1,
      expectsJson: true,
      expectedKeys: ["status", "summary"],
    });

    expect(callGatewayMock).not.toHaveBeenCalled();
    expect(result.details).toMatchObject({
      route: "frontal_cache",
      interactionKind: "verification_request",
      status: "ok",
      cached: true,
      llmCallsSaved: 1,
      reply: '{"status":"ok","summary":"cached summary"}',
      wakeAction: {
        kind: "heartbeat_ok",
      },
    });
  });

  it("reuses an older verified structured result when only non-write turns happened afterward", async () => {
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "main",
      task: "resume el archivo y responde JSON",
      validation: {
        expectsJson: true,
        expectedKeys: ["status", "summary"],
        expectedPaths: [],
      },
      outcome: {
        status: "ok",
        structuredOk: true,
      },
      reply: '{"status":"ok","summary":"cached summary"}',
    });
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "main",
      task: "verifica si el resumen sigue consistente",
      validation: {
        expectsJson: true,
        expectedKeys: ["status", "summary"],
        expectedPaths: [],
      },
      outcome: {
        status: "ok",
        structuredOk: true,
      },
      reply: '{"status":"ok","summary":"another verification"}',
    });

    const result = await getOmegaWorkTool().execute("call-cached-analysis-old", {
      task: "resume el archivo y responde JSON",
      sessionKey: "main",
      timeoutSeconds: 1,
      expectsJson: true,
      expectedKeys: ["status", "summary"],
    });

    expect(callGatewayMock).not.toHaveBeenCalled();
    expect(result.details).toMatchObject({
      route: "frontal_cache",
      status: "ok",
      llmCallsSaved: 1,
      reply: '{"status":"ok","summary":"cached summary"}',
    });
  });

  it("does not reuse a cached analysis after a later verified write changed the world state", async () => {
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "main",
      task: "resume el archivo y responde JSON",
      validation: {
        expectsJson: true,
        expectedKeys: ["status", "summary"],
        expectedPaths: [],
      },
      outcome: {
        status: "ok",
        structuredOk: true,
      },
      reply: '{"status":"ok","summary":"cached summary"}',
    });
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "main",
      task: "patch target file",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: [relA],
      },
      outcome: {
        status: "ok",
        observedChangedFiles: [relA],
        writeOk: true,
      },
    });

    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const request = opts as { method?: string };
      if (request.method === "agent") {
        return { runId: "run-fresh-analysis", status: "accepted" };
      }
      if (request.method === "agent.wait") {
        return { status: "ok" };
      }
      if (request.method === "chat.history") {
        return {
          messages: [
            {
              role: "assistant",
              content: [{ type: "text", text: '{"status":"ok","summary":"fresh after write"}' }],
            },
          ],
        };
      }
      throw new Error(`unexpected method: ${String(request.method)}`);
    });

    const result = await getOmegaWorkTool().execute("call-fresh-analysis", {
      task: "resume el archivo y responde JSON",
      sessionKey: "main",
      timeoutSeconds: 1,
      expectsJson: true,
      expectedKeys: ["status", "summary"],
    });

    expect(callGatewayMock).toHaveBeenCalled();
    expect(result.details).toMatchObject({
      route: "omega_delegate",
      status: "ok",
      reply: '{"status":"ok","summary":"fresh after write"}',
    });
  });

  it("reuses a target-bound verified result when later writes only touched unrelated files", async () => {
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "main",
      task: "patch target file",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: [relA],
      },
      outcome: {
        status: "error",
        errorKind: "target_not_touched",
        observedChangedFiles: [],
        writeOk: false,
      },
    });
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "main",
      task: "verify whether the module is fixed",
      validation: {
        expectsJson: true,
        expectedKeys: ["status", "summary"],
        expectedPaths: [],
      },
      outcome: {
        status: "ok",
        structuredOk: true,
      },
      reply: '{"status":"ok","summary":"module verified"}',
    });
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "main",
      task: "patch unrelated test file",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: [relB],
      },
      outcome: {
        status: "ok",
        observedChangedFiles: [relB],
        writeOk: true,
      },
    });

    const result = await getOmegaWorkTool().execute("call-cached-target-bound", {
      task: "verify whether the module is fixed",
      sessionKey: "main",
      timeoutSeconds: 1,
      expectsJson: true,
      expectedKeys: ["status", "summary"],
    });

    expect(callGatewayMock).not.toHaveBeenCalled();
    expect(result.details).toMatchObject({
      route: "frontal_cache",
      status: "ok",
      cached: true,
      llmCallsSaved: 1,
      reply: '{"status":"ok","summary":"module verified"}',
    });
  });

  it("does not reuse a target-bound verified result after the same target changed", async () => {
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "main",
      task: "patch target file",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: [relA],
      },
      outcome: {
        status: "error",
        errorKind: "target_not_touched",
        observedChangedFiles: [],
        writeOk: false,
      },
    });
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "main",
      task: "verify whether the module is fixed",
      validation: {
        expectsJson: true,
        expectedKeys: ["status", "summary"],
        expectedPaths: [],
      },
      outcome: {
        status: "ok",
        structuredOk: true,
      },
      reply: '{"status":"ok","summary":"module verified"}',
    });
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "main",
      task: "patch target file",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: [relA],
      },
      outcome: {
        status: "ok",
        observedChangedFiles: [relA],
        writeOk: true,
      },
    });

    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const request = opts as { method?: string };
      if (request.method === "agent") {
        return { runId: "run-fresh-target-analysis", status: "accepted" };
      }
      if (request.method === "agent.wait") {
        return { status: "ok" };
      }
      if (request.method === "chat.history") {
        return {
          messages: [
            {
              role: "assistant",
              content: [{ type: "text", text: '{"status":"ok","summary":"module changed"}' }],
            },
          ],
        };
      }
      throw new Error(`unexpected method: ${String(request.method)}`);
    });

    const result = await getOmegaWorkTool().execute("call-fresh-target-analysis", {
      task: "verify whether the module is fixed",
      sessionKey: "main",
      timeoutSeconds: 1,
      expectsJson: true,
      expectedKeys: ["status", "summary"],
    });

    expect(callGatewayMock).toHaveBeenCalled();
    expect(result.details).toMatchObject({
      route: "omega_delegate",
      status: "ok",
      reply: '{"status":"ok","summary":"module changed"}',
    });
  });

  it("escalates repeated verified write failures to an isolated repair lane", async () => {
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "main",
      task: "arregla solo el modulo",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: [relA],
      },
      outcome: {
        status: "error",
        errorKind: "target_not_touched",
        observedChangedFiles: [],
        writeOk: false,
      },
    });
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "main",
      task: "arregla solo el modulo",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: [relA],
      },
      outcome: {
        status: "error",
        errorKind: "target_not_touched",
        observedChangedFiles: [],
        writeOk: false,
      },
    });

    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const request = opts as { method?: string };
      if (request.method === "sessions.patch") {
        return { ok: true };
      }
      if (request.method === "agent") {
        return { runId: "run-escalated", status: "accepted" };
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
              content: [
                { type: "text", text: '{"status":"ok","summary":"patched after escalation"}' },
              ],
            },
          ],
        };
      }
      return {};
    });

    const result = await getOmegaWorkTool().execute("call-escalated-repair", {
      task: "arregla solo el modulo, sigue fallando",
      sessionKey: "main",
      timeoutSeconds: 1,
      expectsJson: true,
      expectedKeys: ["status", "summary"],
      expectedPaths: [relA],
    });

    expect(result.details).toMatchObject({
      route: "sessions_spawn",
      escalatedByOmega: true,
      escalationReason: "repeated_verified_write_failure",
      status: "ok",
      observedChangedFiles: [relA],
      wakeAction: {
        kind: "heartbeat_ok",
      },
    });
  });

  it("rehydrates an interrupted goal from kernel state and resumes it with inherited validation", async () => {
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "main",
      task: "arregla solo el modulo",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: [relA],
      },
      outcome: {
        status: "error",
        errorKind: "target_not_touched",
        observedChangedFiles: [],
        writeOk: false,
      },
    });

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
        expect(request.params?.message).toContain(`Remaining target paths: ${relA}`);
        return { runId: "run-recovered-from-kernel", status: "accepted" };
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
              content: [{ type: "text", text: "patched from recovery" }],
            },
          ],
        };
      }
      return {};
    });

    const result = await getOmegaWorkTool().execute("call-recovered-from-kernel", {
      task: "arregla solo el modulo",
      sessionKey: "main",
      timeoutSeconds: 1,
    });

    expect(result.details).toMatchObject({
      route: "sessions_spawn",
      resumedFromKernel: true,
      recoveryReason: "verified_write_failure_after_restart",
      recoverySuggestedRoute: "sessions_spawn",
      status: "ok",
      observedChangedFiles: [relA],
      wakeAction: {
        kind: "heartbeat_ok",
      },
    });
    await expect(fs.readFile(fileA, "utf-8")).resolves.toContain("max(0, v)");
  });

  it("does not escalate isolated repair when repeated failures belong to a different target", async () => {
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "main",
      task: "arregla solo el modulo",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: [relA],
      },
      outcome: {
        status: "error",
        errorKind: "target_not_touched",
        observedChangedFiles: [],
        writeOk: false,
      },
    });
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "main",
      task: "arregla solo el modulo",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: [relA],
      },
      outcome: {
        status: "error",
        errorKind: "target_not_touched",
        observedChangedFiles: [],
        writeOk: false,
      },
    });

    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const request = opts as { method?: string };
      if (request.method === "agent") {
        return { runId: "run-no-escalation", status: "accepted" };
      }
      if (request.method === "agent.wait") {
        await fs.writeFile(fileB, "def test_placeholder():\n    assert 2 + 2 == 4\n", "utf-8");
        return { status: "ok" };
      }
      if (request.method === "chat.history") {
        return {
          messages: [
            {
              role: "assistant",
              content: [{ type: "text", text: '{"status":"ok","summary":"checked target B"}' }],
            },
          ],
        };
      }
      throw new Error(`unexpected method: ${String(request.method)}`);
    });

    const result = await getOmegaWorkTool().execute("call-no-escalation", {
      task: "arregla solo el test, sigue fallando",
      sessionKey: "main",
      timeoutSeconds: 1,
      expectsJson: true,
      expectedKeys: ["status", "summary"],
      expectedPaths: [relB],
    });

    expect(result.details).toMatchObject({
      route: "omega_delegate",
      status: "ok",
      runId: "run-no-escalation",
    });
  });
});
