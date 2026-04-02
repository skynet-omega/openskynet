import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runSkynetRuntimeObserverDataset01 } from "./runtime_observer_dataset_01.js";

describe("runtime observer dataset 01", () => {
  let workspaceRoot = "";
  let sessionsDir = "";

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skynet-runtime-dataset-"));
    sessionsDir = path.join(workspaceRoot, "sessions");
    await fs.mkdir(sessionsDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it("exports encoded runtime trajectory rows", async () => {
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

    const result = await runSkynetRuntimeObserverDataset01({
      workspaceRoot,
      sessionKey: "agent:openskynet:main",
      sessionsDir,
    });

    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.featureDimensions).toBeGreaterThan(0);
    expect(result.rows[0]?.features.length).toBe(result.featureDimensions);
  });
});
