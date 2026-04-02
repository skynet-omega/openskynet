import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runSkynetCausalValenceObservability01 } from "./causal_valence_observability_01.js";

describe("skynet causal valence observability 01", () => {
  let workspaceRoot = "";
  let sessionsDir = "";

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skynet-causal-observability-01-"));
    sessionsDir = path.join(workspaceRoot, "sessions");
    await fs.mkdir(sessionsDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it("writes an observability verdict artifact", async () => {
    const lines = [];
    for (let i = 0; i < 32; i += 1) {
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
    await fs.writeFile(
      path.join(sessionsDir, "session.jsonl"),
      lines.map((line) => JSON.stringify(line)).join("\n") + "\n",
      "utf-8",
    );

    const result = await runSkynetCausalValenceObservability01({
      workspaceRoot,
      sessionKey: "agent:openskynet:main",
      sessionsDir,
    });

    expect(result.verdict).toBe("pass");
    expect(
      await fs.readFile(
        path.join(workspaceRoot, "memory", "SKYNET_EXPERIMENT_CAUSAL_VALENCE_OBSERVABILITY_01.md"),
        "utf-8",
      ),
    ).toContain("# SKYNET Experiment - Causal Valence Observability 01");
  });
});
