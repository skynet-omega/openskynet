import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runSkynetRuntimeObserver01 } from "./runtime_observer_01.js";

describe("skynet runtime observer 01", () => {
  let workspaceRoot = "";
  let sessionsDir = "";

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skynet-runtime-observer-01-"));
    sessionsDir = path.join(workspaceRoot, "sessions");
    await fs.mkdir(sessionsDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it("writes runtime observer artifacts from transcript data", async () => {
    const lines = [];
    for (let i = 0; i < 10; i += 1) {
      lines.push({
        type: "message",
        timestamp: `2026-04-01T00:${String(i).padStart(2, "0")}:00.000Z`,
        message: {
          role: "assistant",
          content: [
            {
              type: "toolCall",
              id: `read-${i}`,
              name: "read",
              arguments: { file_path: `/tmp/a${i}.ts` },
            },
          ],
        },
      });
      lines.push({
        type: "message",
        message: {
          role: "toolResult",
          toolCallId: `read-${i}`,
          toolName: "read",
          details: { status: "completed" },
        },
      });
      lines.push({
        type: "message",
        timestamp: `2026-04-01T01:${String(i).padStart(2, "0")}:00.000Z`,
        message: {
          role: "assistant",
          content: [
            {
              type: "toolCall",
              id: `edit-${i}`,
              name: "edit",
              arguments: { file_path: `/tmp/b${i}.ts` },
            },
          ],
        },
      });
      lines.push({
        type: "message",
        message: {
          role: "toolResult",
          toolCallId: `edit-${i}`,
          toolName: "edit",
          details: { status: "completed" },
        },
      });
      lines.push({
        type: "message",
        timestamp: `2026-04-01T02:${String(i).padStart(2, "0")}:00.000Z`,
        message: {
          role: "assistant",
          content: [
            {
              type: "toolCall",
              id: `delete-${i}`,
              name: "exec",
              arguments: { command: `rm -v /tmp/c${i}.ts` },
            },
          ],
        },
      });
      lines.push({
        type: "message",
        message: {
          role: "toolResult",
          toolCallId: `delete-${i}`,
          toolName: "exec",
          details: { status: "error", exitCode: 1 },
        },
      });
    }
    await fs.writeFile(
      path.join(sessionsDir, "session.jsonl"),
      lines.map((line) => JSON.stringify(line)).join("\n") + "\n",
      "utf-8",
    );

    const result = await runSkynetRuntimeObserver01({
      workspaceRoot,
      sessionKey: "agent:openskynet:main",
      sessionsDir,
    });

    expect(result.harvestedEpisodes).toBe(30);
    expect(result.trajectorySamples).toBeGreaterThan(20);
    expect(
      await fs.readFile(
        path.join(workspaceRoot, "memory", "SKYNET_EXPERIMENT_RUNTIME_OBSERVER_01.md"),
        "utf-8",
      ),
    ).toContain("# SKYNET Experiment - Runtime Observer 01");
  });
});
