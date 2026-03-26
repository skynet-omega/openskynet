import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { syncOmegaStudySupervisor } from "./study-supervisor.js";

describe("omega study supervisor", () => {
  let workspaceRoot = "";

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "omega-study-supervisor-"));
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it("persists a study queue and prioritizes selective memory when locality failures dominate", async () => {
    const state = await syncOmegaStudySupervisor({
      workspaceRoot,
      sessionKey: "agent:tester:main",
      problemAgenda: [
        {
          id: "failure-touch",
          classKey: "failure:missing_target_writes",
          label: "required targets were not touched",
          source: "failure_pattern",
          status: "open",
          priority: 0.82,
          evidenceCount: 3,
          activationCount: 0,
          successCount: 0,
          failureCount: 3,
          realizedUtility: -0.4,
          firstSeenAt: 1,
          lastSeenAt: 2,
        },
      ],
      relevantMemories: [
        {
          id: "mem-1",
          kind: "repeated_failure",
          task: "patch target files",
          targets: ["src/a.ts"],
          errorKind: "missing_target_writes",
          observedChangedFiles: ["src/b.ts"],
          successCount: 0,
          failureCount: 2,
          learnedConstraints: ["touch_required_targets", "touch_every_required_target"],
          firstSeenAt: 1,
          lastSeenAt: 2,
          lastOutcomeStatus: "error",
          localityScore: 0.3,
          protectedPreservationRate: 0.5,
        },
      ],
      operationalSignals: [
        {
          id: "op-1",
          recordedAt: 1,
          iteration: 1,
          terminationReason: "completed",
          turnHealth: "stalled",
          progressObserved: false,
          timelineDelta: 0,
          kernelUpdated: true,
          latencyBreakdown: {
            sendAgentTurnMs: 1000,
            loadSnapshotMs: 100,
            readLatestReplyMs: 150,
            totalMs: 15000,
          },
          causalImpact: 0,
        },
      ],
      learnedConstraints: ["touch_required_targets", "touch_every_required_target"],
      localityExecutionGuard: {
        shouldIsolate: true,
        confidence: 0.8,
        evidenceCount: 2,
        atRiskPaths: ["src/protected.ts"],
        reasons: ["unexpected_collateral_writes"],
      },
    });

    expect(state.focus.key).toBe("memory_selective_rewrite");
    expect(state.tracks).toHaveLength(5);

    const queuePath = path.join(workspaceRoot, "memory", "OMEGA_STUDY_QUEUE.md");
    const queue = await fs.readFile(queuePath, "utf-8");
    expect(queue).toContain("Focus Activo");
    expect(queue).toContain("Memoria selectiva con reescritura local");
    expect(queue).toContain("touch_required_targets");
  });
});
