import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runSkynetCausalValenceObserved01 } from "./causal_valence_observed_01.js";

describe("skynet causal valence observed 01", () => {
  let workspaceRoot = "";
  let sessionsDir = "";

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skynet-causal-observed-01-"));
    sessionsDir = path.join(workspaceRoot, "sessions");
    await fs.mkdir(sessionsDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it("writes an observed-data benchmark artifact", async () => {
    const lines = [];
    for (let i = 0; i < 4; i += 1) {
      lines.push({
        type: "message",
        timestamp: `2026-04-01T00:0${i}:00.000Z`,
        message: {
          role: "assistant",
          content: [
            {
              type: "toolCall",
              id: `exec-good-${i}`,
              name: "exec",
              arguments: { command: `rm -v /tmp/a${i}.ts` },
            },
          ],
        },
      });
      lines.push({
        type: "message",
        message: {
          role: "toolResult",
          toolCallId: `exec-good-${i}`,
          toolName: "exec",
          details: { status: "completed", exitCode: 0 },
        },
      });
      lines.push({
        type: "message",
        timestamp: `2026-04-01T00:1${i}:00.000Z`,
        message: {
          role: "assistant",
          content: [
            {
              type: "toolCall",
              id: `edit-bad-${i}`,
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
          toolCallId: `edit-bad-${i}`,
          toolName: "edit",
          details: { status: "error", error: "syntax error" },
        },
      });
      lines.push({
        type: "message",
        timestamp: `2026-04-01T00:2${i}:00.000Z`,
        message: {
          role: "assistant",
          content: [
            {
              type: "toolCall",
              id: `read-ok-${i}`,
              name: "read",
              arguments: { file_path: `/tmp/c${i}.ts` },
            },
          ],
        },
      });
      lines.push({
        type: "message",
        message: {
          role: "toolResult",
          toolCallId: `read-ok-${i}`,
          toolName: "read",
          details: { status: "completed" },
        },
      });
    }
    await fs.writeFile(
      path.join(sessionsDir, "session.jsonl"),
      lines.map((line) => JSON.stringify(line)).join("\n") + "\n",
      "utf-8",
    );

    const result = await runSkynetCausalValenceObserved01({
      workspaceRoot,
      sessionKey: "agent:openskynet:main",
      sessionsDir,
    });

    expect(result.harvestedEpisodes).toBe(12);
    expect(result.status).not.toBe("insufficient_data");
    expect(
      await fs.readFile(
        path.join(workspaceRoot, "memory", "SKYNET_EXPERIMENT_CAUSAL_VALENCE_OBSERVED_01.md"),
        "utf-8",
      ),
    ).toContain("# SKYNET Experiment - Causal Valence Observed 01");
  });
});
