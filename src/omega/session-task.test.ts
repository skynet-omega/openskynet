import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const callGatewayMock = vi.fn();

vi.mock("../gateway/call.js", () => ({
  callGateway: (opts: unknown) => callGatewayMock(opts),
}));

import { runValidatedOmegaSessionTask } from "./session-task.js";
import { loadOmegaSessionSelfState, loadOmegaSessionTimeline } from "./session-context.js";

async function createWorkspaceFixture(): Promise<{
  root: string;
  targetPath: string;
  relativeTargetPath: string;
}> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "openskynet-omega-task-"));
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

describe("runValidatedOmegaSessionTask", () => {
  let workspaceRoot = "";
  let targetPath = "";
  let relativeTargetPath = "";

  beforeEach(async () => {
    callGatewayMock.mockReset();
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

  it("returns timeout when agent.wait times out", async () => {
    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const request = opts as { method?: string };
      if (request.method === "agent") {
        return { runId: "run-timeout", status: "accepted" };
      }
      if (request.method === "agent.wait") {
        return { status: "timeout", error: "timed out" };
      }
      throw new Error(`unexpected method: ${String(request.method)}`);
    });

    const result = await runValidatedOmegaSessionTask({
      sendParams: { message: "x", sessionKey: "main" },
      sessionKey: "main",
      timeoutMs: 1_000,
      workspaceRoot,
    });

    expect(result).toMatchObject({
      ok: false,
      status: "timeout",
      error: "timed out",
      runId: "run-timeout",
    });
  });

  it("rejects invalid structured replies", async () => {
    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const request = opts as { method?: string };
      if (request.method === "agent") {
        return { runId: "run-structured", status: "accepted" };
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

    const result = await runValidatedOmegaSessionTask({
      sendParams: { message: "return json", sessionKey: "main" },
      sessionKey: "main",
      timeoutMs: 1_000,
      workspaceRoot,
      validation: {
        expectsJson: true,
        expectedKeys: ["status", "summary"],
      },
    });

    expect(result).toMatchObject({
      ok: false,
      status: "error",
      errorKind: "invalid_structured_result",
      runId: "run-structured",
    });
  });

  it("keeps write evidence when structured output is invalid but the target file really changed", async () => {
    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const request = opts as { method?: string };
      if (request.method === "agent") {
        return { runId: "run-structured-write", status: "accepted" };
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
              content: [{ type: "text", text: "patched the file successfully" }],
            },
          ],
        };
      }
      throw new Error(`unexpected method: ${String(request.method)}`);
    });

    const result = await runValidatedOmegaSessionTask({
      sendParams: { message: "patch file", sessionKey: "main" },
      sessionKey: "main",
      timeoutMs: 1_000,
      workspaceRoot,
      validation: {
        expectsJson: true,
        expectedKeys: ["status", "summary"],
        expectedPaths: [relativeTargetPath],
      },
    });

    expect(result).toMatchObject({
      ok: false,
      status: "error",
      errorKind: "invalid_structured_result",
      runId: "run-structured-write",
      observedChangedFiles: [relativeTargetPath],
      validation: {
        structured: {
          ok: false,
          errorKind: "invalid_structured_result",
          expectedKeys: ["status", "summary"],
        },
        write: {
          ok: true,
          expectedPaths: [relativeTargetPath],
          observedChangedFiles: [relativeTargetPath],
        },
      },
    });
  });

  it("rejects claimed code work when the target path was not touched", async () => {
    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const request = opts as { method?: string };
      if (request.method === "agent") {
        return { runId: "run-write-miss", status: "accepted" };
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
      throw new Error(`unexpected method: ${String(request.method)}`);
    });

    const result = await runValidatedOmegaSessionTask({
      sendParams: { message: "patch file", sessionKey: "main" },
      sessionKey: "main",
      timeoutMs: 1_000,
      workspaceRoot,
      validation: {
        expectedPaths: [relativeTargetPath],
      },
    });

    expect(result).toMatchObject({
      ok: false,
      status: "error",
      errorKind: "target_not_touched",
      observedChangedFiles: [],
      runId: "run-write-miss",
    });
  });

  it("returns success with structured and write validation when the file really changed", async () => {
    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const request = opts as { method?: string };
      if (request.method === "agent") {
        return { runId: "run-ok", status: "accepted" };
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

    const result = await runValidatedOmegaSessionTask({
      sendParams: { message: "patch file", sessionKey: "main" },
      sessionKey: "main",
      timeoutMs: 1_000,
      workspaceRoot,
      validation: {
        expectsJson: true,
        expectedKeys: ["status", "summary"],
        expectedPaths: [relativeTargetPath],
      },
    });

    expect(result).toMatchObject({
      ok: true,
      runId: "run-ok",
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
    const state = await loadOmegaSessionSelfState({
      workspaceRoot,
      sessionKey: "main",
    });
    expect(state).toMatchObject({
      activeGoal: "patch file",
      activeTargets: [relativeTargetPath],
      requiredKeys: ["status", "summary"],
      lastOutcomeStatus: "ok",
      lastSuccessfulTask: "patch file",
      lastInteractionKind: "mixed_turn",
    });
  });

  it("persists object messages as structured task text instead of [object Object]", async () => {
    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const request = opts as { method?: string };
      if (request.method === "agent") {
        return { runId: "run-object-message", status: "accepted" };
      }
      if (request.method === "agent.wait") {
        return { status: "ok" };
      }
      if (request.method === "chat.history") {
        return {
          messages: [
            {
              role: "assistant",
              content: [{ type: "text", text: '{"status":"ok","summary":"verified"}' }],
            },
          ],
        };
      }
      throw new Error(`unexpected method: ${String(request.method)}`);
    });

    await runValidatedOmegaSessionTask({
      sendParams: { message: { text: "structured object task" }, sessionKey: "main" },
      sessionKey: "main",
      timeoutMs: 1_000,
      workspaceRoot,
      validation: {
        expectsJson: true,
        expectedKeys: ["status", "summary"],
      },
    });

    const timeline = await loadOmegaSessionTimeline({
      workspaceRoot,
      sessionKey: "main",
    });
    expect(timeline.at(-1)).toMatchObject({
      task: "structured object task",
    });
  });
});
