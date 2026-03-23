import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  loadOmegaOperationalMemory,
  loadOmegaOperationalMemorySummary,
  recordOmegaOperationalTurnMemory,
  resolveOmegaOperationalMemoryFile,
} from "./operational-memory.js";

describe("omega operational memory", () => {
  let workspaceRoot = "";
  const sessionKey = "agent:tester:main";

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "omega-operational-memory-"));
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it("persists recent structured turn signals on disk", async () => {
    await recordOmegaOperationalTurnMemory({
      workspaceRoot,
      sessionKey,
      turn: {
        iteration: 1,
        terminationReason: "continue",
        stateDelta: {
          timelineDelta: 1,
          kernelUpdated: true,
          progressObserved: true,
        },
        latencyBreakdown: {
          sendAgentTurnMs: 10,
          loadSnapshotMs: 20,
          readLatestReplyMs: 0,
          totalMs: 30,
        },
      },
      turnPolicy: {
        turnHealth: "progressing",
      },
    });

    const entries = await loadOmegaOperationalMemory({ workspaceRoot, sessionKey });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      iteration: 1,
      terminationReason: "continue",
      turnHealth: "progressing",
      progressObserved: true,
    });

    const raw = await fs.readFile(
      resolveOmegaOperationalMemoryFile({ workspaceRoot, sessionKey }),
      "utf-8",
    );
    expect(raw).toContain('"turnHealth": "progressing"');
  });

  it("summarizes recent stalled and resolved turn health", async () => {
    await recordOmegaOperationalTurnMemory({
      workspaceRoot,
      sessionKey,
      turn: {
        iteration: 1,
        terminationReason: "continue",
        stateDelta: {
          timelineDelta: 0,
          kernelUpdated: false,
          progressObserved: false,
        },
        latencyBreakdown: {
          sendAgentTurnMs: 10,
          loadSnapshotMs: 20,
          readLatestReplyMs: 0,
          totalMs: 30,
        },
      },
      turnPolicy: {
        turnHealth: "stalled",
      },
    });
    await recordOmegaOperationalTurnMemory({
      workspaceRoot,
      sessionKey,
      turn: {
        iteration: 2,
        terminationReason: "reply_heartbeat_ok",
        stateDelta: {
          timelineDelta: 1,
          kernelUpdated: true,
          progressObserved: true,
        },
        latencyBreakdown: {
          sendAgentTurnMs: 12,
          loadSnapshotMs: 18,
          readLatestReplyMs: 4,
          totalMs: 34,
        },
      },
      turnPolicy: {
        turnHealth: "resolved",
      },
    });

    const summary = await loadOmegaOperationalMemorySummary({ workspaceRoot, sessionKey });
    expect(summary).toMatchObject({
      recentTurnCount: 2,
      recentStalledTurns: 1,
      recentResolvedTurns: 1,
      latestTurnHealth: "resolved",
    });
  });

  it("preserves concurrent operational turn writes for the same session", async () => {
    await Promise.all([
      recordOmegaOperationalTurnMemory({
        workspaceRoot,
        sessionKey,
        turn: {
          iteration: 1,
          terminationReason: "continue",
          stateDelta: {
            timelineDelta: 0,
            kernelUpdated: false,
            progressObserved: false,
          },
          latencyBreakdown: {
            sendAgentTurnMs: 10,
            loadSnapshotMs: 20,
            readLatestReplyMs: 0,
            totalMs: 30,
          },
        },
        turnPolicy: {
          turnHealth: "stalled",
        },
      }),
      recordOmegaOperationalTurnMemory({
        workspaceRoot,
        sessionKey,
        turn: {
          iteration: 2,
          terminationReason: "structured_idle",
          stateDelta: {
            timelineDelta: 1,
            kernelUpdated: true,
            progressObserved: true,
          },
          latencyBreakdown: {
            sendAgentTurnMs: 12,
            loadSnapshotMs: 18,
            readLatestReplyMs: 4,
            totalMs: 34,
          },
        },
        turnPolicy: {
          turnHealth: "resolved",
        },
      }),
    ]);

    const entries = await loadOmegaOperationalMemory({ workspaceRoot, sessionKey });
    const raw = await fs.readFile(
      resolveOmegaOperationalMemoryFile({ workspaceRoot, sessionKey }),
      "utf-8",
    );

    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.iteration)).toEqual(expect.arrayContaining([1, 2]));
    expect(raw).toContain('"revision": 2');
  });
});
