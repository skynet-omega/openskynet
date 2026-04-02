import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runSkynetCognitiveKernelLive01 } from "./cognitive_kernel_live_01.js";

describe("skynet cognitive kernel live 01", () => {
  let workspaceRoot = "";
  let sessionsDir = "";

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skynet-cognitive-kernel-live-"));
    sessionsDir = path.join(workspaceRoot, "sessions");
    await fs.mkdir(sessionsDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it("ingests only unseen trajectory samples into persisted state", async () => {
    const lines = [];
    for (let i = 0; i < 6; i += 1) {
      lines.push({
        type: "message",
        timestamp: `2026-04-01T00:${String(i).padStart(2, "0")}:00.000Z`,
        message: {
          role: "assistant",
          content: [
            {
              type: "toolCall",
              id: `edit-${i}`,
              name: "edit",
              arguments: { file_path: `/tmp/a${i}.ts` },
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
        timestamp: `2026-04-01T01:${String(i).padStart(2, "0")}:00.000Z`,
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

    const first = await runSkynetCognitiveKernelLive01({
      workspaceRoot,
      sessionKey: "agent:openskynet:main",
      sessionsDir,
    });
    const second = await runSkynetCognitiveKernelLive01({
      workspaceRoot,
      sessionKey: "agent:openskynet:main",
      sessionsDir,
    });

    expect(first.ingestedSamples).toBeGreaterThan(0);
    expect(second.ingestedSamples).toBe(0);
    expect(second.skippedSamples).toBe(first.trajectorySamples);
    expect(second.observedCount).toBe(first.observedCount);
  });
});
