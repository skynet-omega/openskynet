import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { harvestSkynetObservedCausalEpisodes } from "./observed-harvester.js";

describe("skynet observed causal harvester", () => {
  let root = "";
  let sessionFile = "";

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "skynet-observed-harvester-"));
    sessionFile = path.join(root, "session.jsonl");
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("harvests structured episodes from tool calls and tool results", async () => {
    const lines = [
      {
        type: "message",
        timestamp: "2026-04-01T00:00:00.000Z",
        message: {
          role: "assistant",
          content: [
            {
              type: "toolCall",
              id: "exec-1",
              name: "exec",
              arguments: { command: "rm -v /tmp/a.ts /tmp/b.ts" },
            },
          ],
        },
      },
      {
        type: "message",
        message: {
          role: "toolResult",
          toolCallId: "exec-1",
          toolName: "exec",
          details: { status: "completed", exitCode: 0 },
        },
      },
      {
        type: "message",
        timestamp: "2026-04-01T00:01:00.000Z",
        message: {
          role: "assistant",
          content: [
            {
              type: "toolCall",
              id: "edit-1",
              name: "edit",
              arguments: { file_path: "/tmp/a.ts" },
            },
          ],
        },
      },
      {
        type: "message",
        message: {
          role: "toolResult",
          toolCallId: "edit-1",
          toolName: "edit",
          details: { status: "error", error: "syntax error" },
        },
      },
    ];
    await fs.writeFile(
      sessionFile,
      lines.map((line) => JSON.stringify(line)).join("\n") + "\n",
      "utf-8",
    );

    const result = await harvestSkynetObservedCausalEpisodes({ sessionFiles: [sessionFile] });

    expect(result.harvestedToolResults).toBe(2);
    expect(result.episodes[0]?.transition.operations[0]?.kind).toBe("delete");
    expect(result.episodes[0]?.outcome.status).toBe("ok");
    expect(result.episodes[1]?.transition.operations[0]?.kind).toBe("edit");
    expect(result.episodes[1]?.outcome.status).toBe("error");
    expect(result.episodes[1]?.outcome.failureClass).toBe("validation_error");
    expect(result.episodes[1]?.outcome.failureDomain).toBe("cognitive");
  });

  it("treats successful diagnostic exec with no explicit path as target-satisfying relief after failures", async () => {
    const lines = [
      {
        type: "message",
        timestamp: "2026-04-01T00:00:00.000Z",
        message: {
          role: "assistant",
          content: [
            {
              type: "toolCall",
              id: "edit-1",
              name: "edit",
              arguments: { file_path: "/tmp/a.ts" },
            },
          ],
        },
      },
      {
        type: "message",
        message: {
          role: "toolResult",
          toolCallId: "edit-1",
          toolName: "edit",
          details: { status: "error", error: "syntax error" },
        },
      },
      {
        type: "message",
        timestamp: "2026-04-01T00:01:00.000Z",
        message: {
          role: "assistant",
          content: [
            {
              type: "toolCall",
              id: "exec-2",
              name: "exec",
              arguments: { command: "openclaw status" },
            },
          ],
        },
      },
      {
        type: "message",
        message: {
          role: "toolResult",
          toolCallId: "exec-2",
          toolName: "exec",
          details: { status: "completed", exitCode: 0 },
        },
      },
    ];
    await fs.writeFile(
      sessionFile,
      lines.map((line) => JSON.stringify(line)).join("\n") + "\n",
      "utf-8",
    );

    const result = await harvestSkynetObservedCausalEpisodes({ sessionFiles: [sessionFile] });

    expect(result.episodes).toHaveLength(2);
    expect(result.episodes[1]?.outcome.targetSatisfied).toBe(true);
    expect(result.episodes[1]?.bootstrapLabel).toBe("relief");
  });

  it("classifies rate limits as environmental instead of cognitive damage", async () => {
    const lines = [
      {
        type: "message",
        timestamp: "2026-04-01T00:00:00.000Z",
        message: {
          role: "assistant",
          content: [
            {
              type: "toolCall",
              id: "exec-rl",
              name: "exec",
              arguments: { command: "openclaw status" },
            },
          ],
        },
      },
      {
        type: "message",
        message: {
          role: "toolResult",
          toolCallId: "exec-rl",
          toolName: "exec",
          details: { status: "error", error: "429 No capacity available for model gemini" },
        },
      },
    ];
    await fs.writeFile(
      sessionFile,
      lines.map((line) => JSON.stringify(line)).join("\n") + "\n",
      "utf-8",
    );

    const result = await harvestSkynetObservedCausalEpisodes({ sessionFiles: [sessionFile] });

    expect(result.episodes).toHaveLength(1);
    expect(result.episodes[0]?.outcome.failureDomain).toBe("environmental");
    expect(result.episodes[0]?.outcome.failureClass).toBe("provider_rate_limit");
    expect(result.episodes[0]?.bootstrapLabel).toBe("stall");
  });

  it("classifies session locks as environmental instead of cognitive failures", async () => {
    const lines = [
      {
        type: "message",
        timestamp: "2026-04-01T00:00:00.000Z",
        message: {
          role: "assistant",
          content: [
            {
              type: "toolCall",
              id: "exec-lock",
              name: "exec",
              arguments: { command: "openclaw status" },
            },
          ],
        },
      },
      {
        type: "message",
        message: {
          role: "toolResult",
          toolCallId: "exec-lock",
          toolName: "exec",
          details: { status: "error", error: "session file locked (timeout 30000ms): main lock" },
        },
      },
    ];
    await fs.writeFile(
      sessionFile,
      lines.map((line) => JSON.stringify(line)).join("\n") + "\n",
      "utf-8",
    );

    const result = await harvestSkynetObservedCausalEpisodes({ sessionFiles: [sessionFile] });

    expect(result.episodes).toHaveLength(1);
    expect(result.episodes[0]?.outcome.failureDomain).toBe("environmental");
    expect(result.episodes[0]?.outcome.failureClass).toBe("session_lock");
    expect(result.episodes[0]?.bootstrapLabel).toBe("stall");
  });
});
