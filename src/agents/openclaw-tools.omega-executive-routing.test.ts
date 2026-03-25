import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const callGatewayMock = vi.fn();
const resolveOmegaValidatedWorkRoutingMock = vi.fn();

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

vi.mock("../omega/execution-controller.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../omega/execution-controller.js")>();
  return {
    ...actual,
    resolveOmegaValidatedWorkRouting: (params: unknown) =>
      resolveOmegaValidatedWorkRoutingMock(params),
  };
});

import "./test-helpers/fast-core-tools.js";
import { createOpenClawTools } from "./openclaw-tools.js";

describe("omega_work executive routing integration", () => {
  let workspaceRoot = "";

  beforeEach(async () => {
    callGatewayMock.mockReset();
    resolveOmegaValidatedWorkRoutingMock.mockReset();
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openskynet-omega-exec-route-"));
    resolveOmegaValidatedWorkRoutingMock.mockResolvedValue({
      plannedRoute: "omega_delegate",
      executiveRoutingDirective: {
        route: "sessions_spawn",
        reason: "executive_recover_isolated_bias",
        selectedAction: "recover",
        queueKind: "anomaly",
      },
    });
    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const request = opts as { method?: string };
      if (request.method === "sessions.patch") {
        return { ok: true };
      }
      if (request.method === "agent") {
        return { runId: "run-executive-route", status: "accepted" };
      }
      if (request.method === "agent.wait") {
        return { status: "ok" };
      }
      if (request.method === "chat.history") {
        return {
          messages: [
            {
              role: "assistant",
              content: [{ type: "text", text: '{"status":"ok","summary":"spawned"}' }],
            },
          ],
        };
      }
      return {};
    });
  });

  afterEach(async () => {
    if (workspaceRoot) {
      await fs.rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("lets the executive controller override the local validated route", async () => {
    const tool = createOpenClawTools({
      agentSessionKey: "main",
      agentChannel: "discord",
      workspaceDir: workspaceRoot,
    }).find((candidate) => candidate.name === "omega_work");
    expect(tool).toBeDefined();
    if (!tool) {
      throw new Error("missing omega_work");
    }

    const result = await tool.execute("omega-exec-route", {
      task: "arregla solo el modulo",
      sessionKey: "main",
      timeoutSeconds: 1,
      expectsJson: true,
      expectedKeys: ["status", "summary"],
      expectedPaths: ["workspace/hard_probe/range_tools.py"],
    });

    expect(resolveOmegaValidatedWorkRoutingMock).toHaveBeenCalled();
    expect(result.details).toMatchObject({
      route: "sessions_spawn",
    });
  });
});
