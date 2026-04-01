import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { withEnvAsync } from "../test-utils/env.js";
import { admitOmegaDurableMemory } from "./durable-memory.js";
import { recordOmegaRecoveryStrategyMetrics } from "./empirical-metrics.js";
import { buildIdleOmegaHeartbeatPrompt } from "./heartbeat-idle.js";
import { recordOmegaOperationalTurnMemory } from "./operational-memory.js";
import { recordOmegaSessionOutcome } from "./session-context.js";
import { loadOmegaWorldModelSnapshot } from "./world-model.js";

describe("omega world model", () => {
  let workspaceRoot = "";
  const sessionKey = "agent:tester:main";

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "omega-world-model-"));
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it("builds a persisted world model from verified outcomes", async () => {
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey,
      task: "Fix session continuity bug",
      validation: { expectsJson: false, expectedKeys: [], expectedPaths: ["src/session.ts"] },
      outcome: {
        status: "ok",
        observedChangedFiles: ["src/session.ts"],
        writeOk: true,
      },
    });

    await admitOmegaDurableMemory({
      workspaceRoot,
      sessionKey,
      task: "Fix session continuity bug",
      validation: { expectsJson: false, expectedKeys: [], expectedPaths: ["src/session.ts"] },
      outcome: {
        status: "ok",
        observedChangedFiles: ["src/session.ts"],
        writeOk: true,
      },
    });

    const snapshot = await loadOmegaWorldModelSnapshot({
      workspaceRoot,
      sessionKey,
      task: "session continuity regression",
      expectedPaths: ["src/session.ts"],
    });

    expect(snapshot.kernel?.turnCount).toBe(1);
    expect(snapshot.timelineLength).toBe(1);
    expect(snapshot.relevantMemories).toHaveLength(1);
    expect(snapshot.relevantMemories[0]?.task).toContain("Fix session continuity bug");
  });

  it("uses the world model instead of source-code self-audits when kernel is empty", async () => {
    const prompt = await buildIdleOmegaHeartbeatPrompt({
      workspaceRoot,
      sessionKey,
      kernel: undefined,
    });

    expect(prompt).toContain("[OMEGA World Model]");
    expect(prompt).toContain("Kernel state: unavailable");
    expect(prompt).toContain("HEARTBEAT_OK");
    expect(prompt).not.toContain("Read src/omega/heartbeat.ts");
    expect(prompt).not.toContain("Read src/omega/self-time-kernel.ts");
  });

  it("keeps speculative idle context out of the default runtime path", async () => {
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey,
      task: "Investigate stalled recovery",
      validation: { expectsJson: false, expectedKeys: [], expectedPaths: [] },
      outcome: {
        status: "error",
        errorKind: "target_not_touched",
        observedChangedFiles: [],
      },
    });
    const snapshot = await loadOmegaWorldModelSnapshot({
      workspaceRoot,
      sessionKey,
    });

    const prompt = await buildIdleOmegaHeartbeatPrompt({
      workspaceRoot,
      sessionKey,
      kernel: snapshot.kernel,
    });

    expect(prompt).not.toContain("=== FRONTAL LOBE ===");
    expect(prompt).not.toContain("--- ACTIVE THOUGHTS ---");
    expect(prompt).toContain("[OMEGA World Model]");
  });

  it("preserves the evidence-based idle prompt when speculative mode is enabled", async () => {
    const kernel = {
      revision: 2,
      sessionKey,
      turnCount: 3,
      activeGoalId: undefined,
      identity: {
        continuityId: "cid",
        firstSeenAt: 1,
        lastSeenAt: 1,
        lastTask: "Investigate stalled recovery",
        lastInteractionKind: "direct_instruction" as const,
      },
      world: {
        lastOutcomeStatus: "error" as const,
        lastErrorKind: "target_not_touched" as const,
        lastObservedChangedFiles: [],
      },
      goals: [],
      tension: {
        openGoalCount: 0,
        staleGoalCount: 0,
        failureStreak: 2,
        repeatedFailureKinds: ["target_not_touched"],
        pendingCorrection: true,
      },
      causalGraph: {
        files: [],
        edges: [],
      },
      updatedAt: 2,
    };

    const prompt = await withEnvAsync({ OPENSKYNET_OMEGA_SPECULATIVE_IDLE: "1" }, async () =>
      buildIdleOmegaHeartbeatPrompt({
        workspaceRoot,
        sessionKey,
        kernel,
      }),
    );

    expect(prompt).toContain("[INNER LIFE — homeostasis]");
    expect(prompt).toContain("[OMEGA World Model]");
  });

  it("includes learned constraints from the persisted self state", async () => {
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey,
      task: "Fix session continuity bug",
      validation: { expectsJson: false, expectedKeys: [], expectedPaths: ["src/session.ts"] },
      outcome: {
        status: "error",
        errorKind: "target_not_touched",
        observedChangedFiles: [],
      },
    });

    const snapshot = await loadOmegaWorldModelSnapshot({
      workspaceRoot,
      sessionKey,
    });

    expect(snapshot.selfState?.activeGoal).toBe("Fix session continuity bug");
    expect(snapshot.selfState?.learnedConstraints).toContain("touch_required_targets");
  });

  it("includes active recovery preference derived from empirical route wins", async () => {
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey,
      task: "Fix session continuity bug",
      validation: { expectsJson: false, expectedKeys: [], expectedPaths: ["src/session.ts"] },
      outcome: {
        status: "error",
        errorKind: "target_not_touched",
        observedChangedFiles: [],
      },
    });
    await recordOmegaRecoveryStrategyMetrics({
      workspaceRoot,
      strategy: "target_not_touched|single_target|contained|omega_delegate",
      success: true,
    });
    await recordOmegaRecoveryStrategyMetrics({
      workspaceRoot,
      strategy: "target_not_touched|single_target|contained|omega_delegate",
      success: true,
    });
    await recordOmegaRecoveryStrategyMetrics({
      workspaceRoot,
      strategy: "target_not_touched|single_target|contained|sessions_spawn",
      success: false,
    });

    const snapshot = await loadOmegaWorldModelSnapshot({
      workspaceRoot,
      sessionKey,
    });

    expect(snapshot.activeRecoveryPreference).toMatchObject({
      preferredRoute: "omega_delegate",
      delegateSuccesses: 2,
      isolatedSuccesses: 0,
    });
  });

  it("falls back to generalized recovery preference by mechanism class", async () => {
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey,
      task: "Fix session continuity bug",
      validation: { expectsJson: false, expectedKeys: [], expectedPaths: ["src/session.ts"] },
      outcome: {
        status: "error",
        errorKind: "target_not_touched",
        observedChangedFiles: [],
      },
    });
    await recordOmegaRecoveryStrategyMetrics({
      workspaceRoot,
      strategy: "target_not_touched|single_target|collateral|omega_delegate",
      success: false,
    });
    await recordOmegaRecoveryStrategyMetrics({
      workspaceRoot,
      strategy: "target_not_touched|single_target|contained|sessions_spawn",
      success: true,
    });
    await recordOmegaRecoveryStrategyMetrics({
      workspaceRoot,
      strategy: "target_not_touched|single_target|contained|sessions_spawn",
      success: true,
    });

    const snapshot = await loadOmegaWorldModelSnapshot({
      workspaceRoot,
      sessionKey,
    });

    expect(snapshot.generalizedRecoveryPreference).toMatchObject({
      preferredRoute: "sessions_spawn",
      mechanismKey: "target_not_touched|single_target",
    });
  });

  it("persists a proactive problem agenda item when no active goal is open", async () => {
    await fs.writeFile(
      path.join(workspaceRoot, "INTERNAL_PROJECT.json"),
      JSON.stringify(
        {
          key: "protein-lab",
          name: "Protein Lab",
          role: "Protein discovery project.",
          mission: "Find useful protein structures.",
          benchmarkPurpose: "Measure sustained autonomous scientific work.",
          successCriteria: ["produces measurable protein artifacts"],
        },
        null,
        2,
      ),
      "utf-8",
    );

    const snapshot = await loadOmegaWorldModelSnapshot({
      workspaceRoot,
      sessionKey,
    });

    expect(snapshot.problemAgenda.length).toBeGreaterThan(0);
    expect(snapshot.problemAgenda[0]?.classKey).toBe("initiative:autonomy_improvement");
    expect(snapshot.studySupervisor?.focus.key).toBe("endogenous_science_agenda");
    expect(snapshot.studySupervisor?.tracks.length).toBeGreaterThanOrEqual(5);
    expect(snapshot.internalProjectNucleus?.name).toBe("Protein Lab");
    expect(snapshot.internalProjectNucleus?.mode).toBe("explore");
    expect(snapshot.internalProjectStudyProgram?.items.length).toBe(3);
    expect(snapshot.internalProjectStudyProgram?.items[0]?.title).toContain("Empujar foco activo");
    expect(snapshot.internalProjectContinuity?.focusStreak).toBe(1);
    expect(snapshot.skynetNucleus).toEqual(snapshot.internalProjectNucleus);
    expect(snapshot.skynetStudyProgram).toEqual(snapshot.internalProjectStudyProgram);
    expect(snapshot.skynetContinuity).toEqual(snapshot.internalProjectContinuity);
  });

  it("includes the study supervisor focus in the idle heartbeat prompt", async () => {
    await fs.writeFile(
      path.join(workspaceRoot, "INTERNAL_PROJECT.json"),
      JSON.stringify(
        {
          key: "protein-lab",
          name: "Protein Lab",
          role: "Protein discovery project.",
          mission: "Find useful protein structures.",
          benchmarkPurpose: "Measure sustained autonomous scientific work.",
          successCriteria: ["produces measurable protein artifacts"],
        },
        null,
        2,
      ),
      "utf-8",
    );

    const prompt = await buildIdleOmegaHeartbeatPrompt({
      workspaceRoot,
      sessionKey,
      kernel: undefined,
    });

    expect(prompt).toContain("[SKYNET Study Supervisor]");
    expect(prompt).toContain("[Protein Lab Nucleus]");
    expect(prompt).toContain("[Protein Lab Study Program]");
    expect(prompt).toContain("[Protein Lab Continuity]");
    expect(prompt).toContain("Agenda científica endógena");
  });

  it("derives an isolation bias from repeated low-locality failures", async () => {
    // Durable Memory now uses a global store in .openskynet/omega-durable-memory/global-durable-memory.json
    const memoryDir = path.join(workspaceRoot, ".openskynet", "omega-durable-memory");
    await fs.mkdir(memoryDir, { recursive: true });
    const memoryFile = path.join(memoryDir, "global-durable-memory.json");

    await fs.writeFile(
      memoryFile,
      JSON.stringify({
        sessionKey,
        updatedAt: Date.now(),
        entries: [
          {
            id: "fail-1",
            kind: "repeated_failure",
            task: "Patch isolated config path",
            targets: ["src/config.ts", "src/other.ts", "src/protected.ts"],
            observedChangedFiles: ["src/config.ts", "src/other.ts", "src/protected.ts"],
            localityScore: 0.3,
            protectedPreservationRate: 0.2,
            failureCount: 2,
            successCount: 0,
            learnedConstraints: [],
            firstSeenAt: Date.now(),
            lastSeenAt: Date.now(),
            lastOutcomeStatus: "error",
          },
        ],
      }),
    );

    const snapshot = await loadOmegaWorldModelSnapshot({
      workspaceRoot,
      sessionKey,
      task: "patch config",
    });

    expect(snapshot.localityRoutingPreference).toMatchObject({
      preferredRoute: "sessions_spawn",
      lowLocalityFailures: 2,
    });
  });

  it("builds a locality execution guard for protected paths with repeated collateral failures", async () => {
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey,
      task: "Patch isolated config path",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: ["src/config.ts"],
        watchedPaths: ["src/config.ts", "src/unrelated.ts"],
      },
      outcome: {
        status: "error",
        errorKind: "unexpected_collateral_writes",
        observedChangedFiles: ["src/config.ts", "src/unrelated.ts"],
        writeOk: false,
        localityScore: 0.25,
        // protectedPreservationRate: 0.1,
      },
    });
    await admitOmegaDurableMemory({
      workspaceRoot,
      sessionKey,
      task: "Patch isolated config path",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: ["src/config.ts"],
        watchedPaths: ["src/config.ts", "src/unrelated.ts"],
      },
      outcome: {
        status: "error",
        errorKind: "unexpected_collateral_writes",
        observedChangedFiles: ["src/config.ts", "src/unrelated.ts"],
        writeOk: false,
        localityScore: 0.25,
        // protectedPreservationRate: 0.1,
      },
    });
    await admitOmegaDurableMemory({
      workspaceRoot,
      sessionKey,
      task: "Patch isolated config path",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: ["src/config.ts"],
        watchedPaths: ["src/config.ts", "src/unrelated.ts"],
      },
      outcome: {
        status: "error",
        errorKind: "unexpected_collateral_writes",
        observedChangedFiles: ["src/config.ts", "src/unrelated.ts"],
        writeOk: false,
        localityScore: 0.25,
        // protectedPreservationRate: 0.1,
      },
    });

    const snapshot = await loadOmegaWorldModelSnapshot({
      workspaceRoot,
      sessionKey,
      task: "patch config",
      expectedPaths: ["src/config.ts"],
      watchedPaths: ["src/config.ts", "src/unrelated.ts"],
    });

    expect(snapshot.localityExecutionGuard).toMatchObject({
      shouldIsolate: true,
      atRiskPaths: ["src/unrelated.ts"],
    });
    expect(snapshot.localityExecutionGuard?.evidenceCount).toBeGreaterThanOrEqual(2);
  });

  it("includes recent operational signals in the world model", async () => {
    await recordOmegaOperationalTurnMemory({
      workspaceRoot,
      sessionKey,
      turn: {
        iteration: 3,
        terminationReason: "reply_heartbeat_ok",
        decision: {
          shouldContinue: false,
          stopReason: "reply_heartbeat_ok",
          replyHeartbeatOk: true,
          structuredIdleDetected: false,
        },
        stateDelta: {
          timelineDelta: 0,
          kernelUpdated: false,
          progressObserved: false,
        },
        latencyBreakdown: {
          sendAgentTurnMs: 15,
          loadSnapshotMs: 25,
          readLatestReplyMs: 5,
          totalMs: 45,
        },
      },
      turnPolicy: {
        turnHealth: "resolved",
        shouldBackoff: false,
      },
    });

    const snapshot = await loadOmegaWorldModelSnapshot({
      workspaceRoot,
      sessionKey,
    });

    expect(snapshot.operationalSignals).toHaveLength(1);
    expect(snapshot.operationalSignals[0]).toMatchObject({
      iteration: 3,
      turnHealth: "resolved",
      terminationReason: "reply_heartbeat_ok",
    });
  });
});
