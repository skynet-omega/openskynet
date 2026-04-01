import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  auditSkynetCausalObservability,
  collectSkynetSessionTranscriptFiles,
} from "./observability-audit.js";

describe("skynet causal observability audit", () => {
  let root = "";
  let sessionsDir = "";

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "skynet-causal-observability-"));
    sessionsDir = path.join(root, "sessions");
    await fs.mkdir(sessionsDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("fails when exec dominates and structured causal surface is too weak", async () => {
    const file = path.join(sessionsDir, "session-a.jsonl");
    const lines = [
      {
        type: "message",
        message: {
          role: "assistant",
          content: [
            { type: "toolCall", id: "1", name: "exec", arguments: { command: "ls -la" } },
            { type: "toolCall", id: "2", name: "exec", arguments: { command: "git status" } },
            { type: "toolCall", id: "3", name: "read", arguments: { file_path: "/tmp/a.ts" } },
          ],
        },
      },
      { type: "message", message: { role: "toolResult", toolCallId: "1", toolName: "exec" } },
      { type: "message", message: { role: "toolResult", toolCallId: "2", toolName: "exec" } },
      { type: "message", message: { role: "toolResult", toolCallId: "3", toolName: "read" } },
    ];
    await fs.writeFile(file, lines.map((line) => JSON.stringify(line)).join("\n") + "\n", "utf-8");

    const audit = await auditSkynetCausalObservability({
      sessionFiles: await collectSkynetSessionTranscriptFiles(sessionsDir),
    });

    expect(audit.verdict).toBe("fail");
    expect(audit.execDominanceRatio).toBeGreaterThan(0.5);
    expect(audit.directlyUsableCalls).toBe(1);
    expect(audit.extractableExecCalls).toBe(1);
  });

  it("passes when structured path-bearing tool calls dominate", async () => {
    const file = path.join(sessionsDir, "session-b.jsonl");
    const lines = [];
    for (let i = 0; i < 20; i += 1) {
      lines.push({
        type: "message",
        message: {
          role: "assistant",
          content: [
            {
              type: "toolCall",
              id: `read-${i}`,
              name: "read",
              arguments: { file_path: `/tmp/file-${i}.ts` },
            },
          ],
        },
      });
      lines.push({
        type: "message",
        message: { role: "toolResult", toolCallId: `read-${i}`, toolName: "read" },
      });
    }
    for (let i = 0; i < 12; i += 1) {
      lines.push({
        type: "message",
        message: {
          role: "assistant",
          content: [
            {
              type: "toolCall",
              id: `edit-${i}`,
              name: "edit",
              arguments: { file_path: `/tmp/file-${i}.ts` },
            },
          ],
        },
      });
      lines.push({
        type: "message",
        message: { role: "toolResult", toolCallId: `edit-${i}`, toolName: "edit" },
      });
    }
    await fs.writeFile(file, lines.map((line) => JSON.stringify(line)).join("\n") + "\n", "utf-8");

    const audit = await auditSkynetCausalObservability({
      sessionFiles: await collectSkynetSessionTranscriptFiles(sessionsDir),
    });

    expect(audit.verdict).toBe("pass");
    expect(audit.usableRatio).toBeGreaterThanOrEqual(0.35);
    expect(audit.adaptedUsableRatio).toBeGreaterThanOrEqual(0.55);
    expect(audit.execDominanceRatio).toBe(0);
  });
});
