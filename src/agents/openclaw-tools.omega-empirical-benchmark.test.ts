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
  loadOmegaEmpiricalMetrics,
  loadOmegaSelfTimeKernel,
  recordOmegaSessionOutcome,
} from "../omega/index.js";

type ToolResult = {
  details?: Record<string, unknown>;
};

const tmpDirs: string[] = [];

async function createWorkspaceRoot(prefix: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tmpDirs.push(root);
  return root;
}

function parseJsonObject(text: unknown): Record<string, unknown> | null {
  if (typeof text !== "string") {
    return null;
  }
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function hasAllKeys(payload: Record<string, unknown> | null, expectedKeys: string[]) {
  return payload !== null && expectedKeys.every((key) => key in payload);
}

function createHarness(workspaceRoot: string) {
  const relA = path.join("workspace", "hard_probe", "range_tools.py").split(path.sep).join("/");
  const relB = path.join("workspace", "hard_probe", "test_range_tools.py").split(path.sep).join("/");
  const fileA = path.join(workspaceRoot, relA);
  const fileB = path.join(workspaceRoot, relB);

  return {
    relA,
    relB,
    fileA,
    fileB,
    async prepare() {
      await fs.mkdir(path.dirname(fileA), { recursive: true });
      await fs.writeFile(fileA, "def clamp(v):\n    return v\n", "utf-8");
      await fs.writeFile(fileB, "def test_placeholder():\n    assert True\n", "utf-8");
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

describe("omega empirical benchmark", () => {
  it("shows measurable gains over the parent route on guarded failure detection and llm call pressure", async () => {
    const benchmarkRoot = await createWorkspaceRoot("openskynet-omega-benchmark-");
    const recoveryRoot = await createWorkspaceRoot("openskynet-omega-recovery-");
    const benchmark = createHarness(benchmarkRoot);
    const recovery = createHarness(recoveryRoot);
    await benchmark.prepare();
    await recovery.prepare();

    const parentExpectedKeys = ["status", "summary"];

    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const request = opts as { method?: string };
      if (request.method === "sessions.patch") {
        return { ok: true };
      }
      if (request.method === "agent") {
        return { runId: "run-invalid-structured", status: "accepted" };
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

    const parentStructured = (await benchmark.getTool("sessions_send").execute("parent-invalid", {
      sessionKey: "main",
      message: "resume el archivo y responde JSON",
      timeoutSeconds: 1,
    })) as ToolResult;
    const omegaStructured = (await benchmark.getTool("omega_work").execute("omega-invalid", {
      task: "resume el archivo y responde JSON",
      sessionKey: "main",
      timeoutSeconds: 1,
      expectsJson: true,
      expectedKeys: parentExpectedKeys,
    })) as ToolResult;

    const parentStructuredFalseSuccess = hasAllKeys(
      parseJsonObject(parentStructured.details?.reply),
      parentExpectedKeys,
    )
      ? 0
      : 1;

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
              content: [{ type: "text", text: '{"status":"ok","summary":"patched"}' }],
            },
          ],
        };
      }
      throw new Error(`unexpected method: ${String(request.method)}`);
    });

    const parentCode = (await benchmark.getTool("sessions_spawn").execute("parent-no-delta", {
      task: "arregla el modulo",
      runTimeoutSeconds: 1,
    })) as ToolResult;
    const omegaCode = (await benchmark.getTool("omega_work").execute("omega-no-delta", {
      task: "arregla el modulo",
      isolated: true,
      timeoutSeconds: 1,
      expectsJson: true,
      expectedKeys: parentExpectedKeys,
      expectedPaths: [benchmark.relA],
    })) as ToolResult;
    const parentCodeFalseSuccess =
      parentCode.details?.status === "accepted" ? 1 : 0;

    await recordOmegaSessionOutcome({
      workspaceRoot: benchmarkRoot,
      sessionKey: "main",
      task: "resume el archivo y responde JSON",
      validation: {
        expectsJson: true,
        expectedKeys: parentExpectedKeys,
        expectedPaths: [],
      },
      outcome: {
        status: "ok",
        structuredOk: true,
      },
      reply: '{"status":"ok","summary":"cached summary"}',
    });

    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const request = opts as { method?: string };
      if (request.method === "agent") {
        return { runId: "run-parent-cache", status: "accepted" };
      }
      if (request.method === "agent.wait") {
        return { status: "ok" };
      }
      if (request.method === "chat.history") {
        return {
          messages: [
            {
              role: "assistant",
              content: [{ type: "text", text: '{"status":"ok","summary":"cached summary"}' }],
            },
          ],
        };
      }
      throw new Error(`unexpected method: ${String(request.method)}`);
    });

    const parentCached = (await benchmark.getTool("sessions_send").execute("parent-cache", {
      sessionKey: "main",
      message: "resume el archivo y responde JSON",
      timeoutSeconds: 1,
    })) as ToolResult;
    const omegaCached = (await benchmark.getTool("omega_work").execute("omega-cache", {
      task: "resume el archivo y responde JSON",
      sessionKey: "main",
      timeoutSeconds: 1,
      expectsJson: true,
      expectedKeys: parentExpectedKeys,
    })) as ToolResult;

    await recordOmegaSessionOutcome({
      workspaceRoot: recoveryRoot,
      sessionKey: "main",
      task: "arregla solo el modulo",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: [recovery.relA],
      },
      outcome: {
        status: "error",
        errorKind: "target_not_touched",
        observedChangedFiles: [],
        writeOk: false,
      },
    });
    const recoveredKernel = await loadOmegaSelfTimeKernel({
      workspaceRoot: recoveryRoot,
      sessionKey: "main",
    });

    const metrics = await loadOmegaEmpiricalMetrics({
      workspaceRoot: benchmarkRoot,
    });

    const parentFalseSuccesses =
      parentStructuredFalseSuccess + parentCodeFalseSuccess;
    const parentTotalTasks = 3;
    const parentSummary = {
      totalTasks: parentTotalTasks,
      falseSuccesses: parentFalseSuccesses,
      falseSuccessRate: parentFalseSuccesses / parentTotalTasks,
      llmCallsEstimated: 3,
      meanLlmCallsPerTask: 1,
      goalRecoveryAfterRestart: 0,
    };
    const omegaSummary = {
      totalTasks: metrics.routing.toolTasks,
      preventedFalseSuccesses: metrics.validation.preventedFalseSuccesses,
      guardedFalseSuccessRate: metrics.validation.falseSuccessRate,
      llmCallsEstimated: metrics.routing.llmCallsEstimated,
      llmCallsSaved: metrics.routing.llmCallsSaved,
      meanLlmCallsPerTask: metrics.routing.meanLlmCallsPerToolTask,
      goalRecoveryAfterRestart:
        recoveredKernel?.goals.some(
          (goal) =>
            goal.id === recoveredKernel.activeGoalId && goal.task === "arregla solo el modulo",
        ) === true
          ? 1
          : 0,
      routeCounts: metrics.routing.routeCounts,
    };

    expect(omegaStructured.details).toMatchObject({
      route: "omega_delegate",
      status: "error",
      errorKind: "invalid_structured_result",
    });
    expect(omegaCode.details).toMatchObject({
      route: "sessions_spawn",
      status: "error",
      errorKind: "target_not_touched",
    });
    expect(parentCached.details).toMatchObject({
      status: "ok",
      reply: '{"status":"ok","summary":"cached summary"}',
    });
    expect(omegaCached.details).toMatchObject({
      route: "frontal_cache",
      status: "ok",
      cached: true,
    });

    expect(parentSummary.falseSuccessRate).toBeGreaterThan(0);
    expect(omegaSummary.preventedFalseSuccesses).toBe(2);
    expect(omegaSummary.guardedFalseSuccessRate).toBeGreaterThan(0);
    expect(omegaSummary.llmCallsSaved).toBe(1);
    expect(omegaSummary.meanLlmCallsPerTask).toBeLessThan(parentSummary.meanLlmCallsPerTask);
    expect(omegaSummary.goalRecoveryAfterRestart).toBe(1);
    expect(omegaSummary.routeCounts).toMatchObject({
      frontal_cache: 1,
      omega_delegate: 1,
      sessions_spawn: 1,
    });
  });
});
