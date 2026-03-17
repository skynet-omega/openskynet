import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildOmegaSessionContextPrompt,
  deriveFocusedActiveTargets,
  deriveShadowedGoalTasks,
  deriveSupersededGoalTasks,
  focusActiveOmegaGoalTargets,
  loadOmegaSelfTimeKernel,
  loadOmegaSessionSelfState,
  loadOmegaSessionTimeline,
  pruneStaleOmegaGoals,
  pruneShadowedOmegaGoals,
  pruneSupersededOmegaGoals,
  recordOmegaSessionOutcome,
  resolveOmegaSessionStateFile,
} from "./session-context.js";

describe("omega session context", () => {
  let workspaceRoot = "";

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openskynet-omega-context-"));
  });

  afterEach(async () => {
    if (workspaceRoot) {
      await fs.rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("persists verified timeline and builds a continuity prompt from prior failures", async () => {
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "main",
      task: "return json",
      validation: {
        expectsJson: true,
        expectedKeys: ["status", "summary"],
        expectedPaths: [],
      },
      outcome: {
        status: "error",
        errorKind: "invalid_structured_result",
        structuredOk: false,
      },
    });
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "main",
      task: "patch target file",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: ["workspace/manual_code_probe/range_tools.py"],
      },
      outcome: {
        status: "error",
        errorKind: "target_not_touched",
        observedChangedFiles: [],
        writeOk: false,
      },
    });

    const timeline = await loadOmegaSessionTimeline({
      workspaceRoot,
      sessionKey: "main",
    });
    const state = await loadOmegaSessionSelfState({
      workspaceRoot,
      sessionKey: "main",
    });
    const kernel = await loadOmegaSelfTimeKernel({
      workspaceRoot,
      sessionKey: "main",
    });
    expect(timeline).toHaveLength(2);
    expect(state).toMatchObject({
      activeGoal: "patch target file",
      activeTargets: ["workspace/manual_code_probe/range_tools.py"],
      lastOutcomeStatus: "error",
      lastErrorKind: "target_not_touched",
      lastFailedTask: "patch target file",
      learnedConstraints: ["return_exact_json_object", "touch_required_targets"],
    });
    expect(kernel).toMatchObject({
      turnCount: 2,
      tension: {
        openGoalCount: 1,
        failureStreak: 2,
        repeatedFailureKinds: [],
        pendingCorrection: true,
      },
      causalGraph: {
        files: expect.arrayContaining([
          expect.objectContaining({
            path: "workspace/manual_code_probe/range_tools.py",
            failureCount: 1,
            lastFailureKind: "target_not_touched",
          }),
        ]),
      },
    });
    expect(kernel?.goals.at(-1)).toMatchObject({
      task: "patch target file",
      status: "active",
      failureCount: 1,
      targets: ["workspace/manual_code_probe/range_tools.py"],
    });
    await expect(
      fs.readFile(
        resolveOmegaSessionStateFile({
          workspaceRoot,
          sessionKey: "main",
        }),
        "utf-8",
      ),
    ).resolves.toContain("invalid_structured_result");

    const prompt = await buildOmegaSessionContextPrompt({
      workspaceRoot,
      sessionKey: "main",
      task: "patch target file and return json",
      validation: {
        expectsJson: true,
        expectedKeys: ["status", "summary"],
        expectedPaths: ["workspace/manual_code_probe/range_tools.py"],
      },
    });

    expect(prompt).toContain("[OMEGA Session Self]");
    expect(prompt).toContain("Role: local_editor");
    expect(prompt).toContain("Persistent goal: patch target file");
    expect(prompt).toContain("Persistent targets: workspace/manual_code_probe/range_tools.py");
    expect(prompt).toContain("Learned constraints: return_exact_json_object, touch_required_targets");
    expect(prompt).toContain("[OMEGA Session Timeline]");
    expect(prompt).toContain("[OMEGA Self/Time Kernel]");
    expect(prompt).toContain("Kernel failure streak: 2");
    expect(prompt).toContain("invalid_structured_result");
    expect(prompt).toContain("target_not_touched");
    expect(prompt).toContain("Return exactly one JSON object");
    expect(prompt).toContain("Touch every required path before claiming success.");
  });

  it("keeps the active goal across a later verification-only turn", async () => {
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "main",
      task: "patch target file",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: ["workspace/manual_code_probe/range_tools.py"],
      },
      outcome: {
        status: "error",
        errorKind: "target_not_touched",
        observedChangedFiles: [],
        writeOk: false,
      },
    });

    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "main",
      task: "verify whether the issue is fixed",
      validation: {
        expectsJson: true,
        expectedKeys: ["status", "summary"],
        expectedPaths: [],
      },
      outcome: {
        status: "ok",
        structuredOk: true,
      },
    });

    const state = await loadOmegaSessionSelfState({
      workspaceRoot,
      sessionKey: "main",
    });
    const timeline = await loadOmegaSessionTimeline({
      workspaceRoot,
      sessionKey: "main",
    });
    const kernel = await loadOmegaSelfTimeKernel({
      workspaceRoot,
      sessionKey: "main",
    });

    expect(state).toMatchObject({
      activeGoal: "patch target file",
      activeTargets: ["workspace/manual_code_probe/range_tools.py"],
      requiredKeys: ["status", "summary"],
      lastInteractionKind: "verification_request",
      lastSuccessfulTask: "verify whether the issue is fixed",
    });
    expect(kernel).toMatchObject({
      turnCount: 2,
      activeGoalId: expect.any(String),
      tension: {
        openGoalCount: 1,
        failureStreak: 0,
      },
    });
    expect(timeline.at(-1)).toMatchObject({
      task: "verify whether the issue is fixed",
      causalTargets: ["workspace/manual_code_probe/range_tools.py"],
    });
  });

  it("persists the verified reply for later frontal reuse", async () => {
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "main",
      task: "verify whether the issue is fixed",
      validation: {
        expectsJson: true,
        expectedKeys: ["status", "summary"],
        expectedPaths: [],
      },
      outcome: {
        status: "ok",
        structuredOk: true,
      },
      reply: '{"status":"ok","summary":"already verified"}',
    });

    const timeline = await loadOmegaSessionTimeline({
      workspaceRoot,
      sessionKey: "main",
    });

    expect(timeline.at(-1)).toMatchObject({
      reply: '{"status":"ok","summary":"already verified"}',
    });
  });

  it("marks a repaired goal as completed after a successful write turn", async () => {
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "main",
      task: "patch target file",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: ["workspace/manual_code_probe/range_tools.py"],
      },
      outcome: {
        status: "error",
        errorKind: "target_not_touched",
        observedChangedFiles: [],
        writeOk: false,
      },
    });

    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "main",
      task: "patch target file",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: ["workspace/manual_code_probe/range_tools.py"],
      },
      outcome: {
        status: "ok",
        observedChangedFiles: ["workspace/manual_code_probe/range_tools.py"],
        writeOk: true,
      },
    });

    const kernel = await loadOmegaSelfTimeKernel({
      workspaceRoot,
      sessionKey: "main",
    });

    expect(kernel).toMatchObject({
      activeGoalId: undefined,
      tension: {
        openGoalCount: 0,
        failureStreak: 0,
      },
    });
    expect(kernel?.goals.at(-1)).toMatchObject({
      task: "patch target file",
      status: "completed",
      failureCount: 1,
      successCount: 1,
      observedChangedFiles: ["workspace/manual_code_probe/range_tools.py"],
    });
    expect(kernel?.causalGraph.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "workspace/manual_code_probe/range_tools.py",
          writeCount: 1,
          failureCount: 1,
        }),
      ]),
    );
  });

  it("prunes stale goals from the kernel ledger without deleting active work", async () => {
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "main",
      task: "task A",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: ["workspace/a.py"],
      },
      outcome: {
        status: "error",
        errorKind: "target_not_touched",
        observedChangedFiles: [],
        writeOk: false,
      },
    });
    for (let turn = 0; turn < 6; turn += 1) {
      await recordOmegaSessionOutcome({
        workspaceRoot,
        sessionKey: "main",
        task: "task B",
        validation: {
          expectsJson: false,
          expectedKeys: [],
          expectedPaths: ["workspace/b.py"],
        },
        outcome: {
          status: "error",
          errorKind: "target_not_touched",
          observedChangedFiles: [],
          writeOk: false,
        },
      });
    }

    const before = await loadOmegaSelfTimeKernel({
      workspaceRoot,
      sessionKey: "main",
    });
    expect(before?.goals.map((goal) => [goal.task, goal.status])).toEqual(
      expect.arrayContaining([
        ["task A", "stale"],
        ["task B", "active"],
      ]),
    );

    const pruned = await pruneStaleOmegaGoals({
      workspaceRoot,
      sessionKey: "main",
    });
    const after = await loadOmegaSelfTimeKernel({
      workspaceRoot,
      sessionKey: "main",
    });

    expect(pruned.prunedGoalTasks).toEqual(["task A"]);
    expect(after?.goals.map((goal) => [goal.task, goal.status])).toEqual([["task B", "active"]]);
    expect(after?.tension.staleGoalCount).toBe(0);
  });

  it("prunes superseded multi-target goals after newer verified writes cover every target", async () => {
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "main",
      task: "fix module and test together",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: ["workspace/a.py", "workspace/b.py"],
      },
      outcome: {
        status: "error",
        errorKind: "target_not_touched",
        observedChangedFiles: [],
        writeOk: false,
      },
    });
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "main",
      task: "fix module only",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: ["workspace/a.py"],
      },
      outcome: {
        status: "ok",
        observedChangedFiles: ["workspace/a.py"],
        writeOk: true,
      },
    });
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "main",
      task: "fix test only",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: ["workspace/b.py"],
      },
      outcome: {
        status: "ok",
        observedChangedFiles: ["workspace/b.py"],
        writeOk: true,
      },
    });

    const before = await loadOmegaSelfTimeKernel({
      workspaceRoot,
      sessionKey: "main",
    });
    expect(deriveSupersededGoalTasks(before)).toEqual(["fix module and test together"]);

    const pruned = await pruneSupersededOmegaGoals({
      workspaceRoot,
      sessionKey: "main",
    });
    const after = await loadOmegaSelfTimeKernel({
      workspaceRoot,
      sessionKey: "main",
    });

    expect(pruned.prunedGoalTasks).toEqual(["fix module and test together"]);
    expect(after?.goals.some((goal) => goal.task === "fix module and test together")).toBe(false);
    expect(after?.goals.some((goal) => goal.task === "fix module only")).toBe(true);
    expect(after?.goals.some((goal) => goal.task === "fix test only")).toBe(true);
    expect(after?.tension.openGoalCount).toBe(0);
  });

  it("narrows active targets to the unresolved subset after verified partial progress", async () => {
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "main",
      task: "fix module and test together",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: ["workspace/a.py", "workspace/b.py"],
      },
      outcome: {
        status: "error",
        errorKind: "target_not_touched",
        observedChangedFiles: [],
        writeOk: false,
      },
    });
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "main",
      task: "fix module only",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: ["workspace/a.py"],
      },
      outcome: {
        status: "ok",
        observedChangedFiles: ["workspace/a.py"],
        writeOk: true,
      },
    });

    const beforeKernel = await loadOmegaSelfTimeKernel({
      workspaceRoot,
      sessionKey: "main",
    });
    expect(deriveFocusedActiveTargets(beforeKernel)).toEqual(["workspace/b.py"]);

    const focused = await focusActiveOmegaGoalTargets({
      workspaceRoot,
      sessionKey: "main",
    });
    const afterState = await loadOmegaSessionSelfState({
      workspaceRoot,
      sessionKey: "main",
    });

    expect(focused).toEqual({
      focusedGoalTask: "fix module and test together",
      focusedTargets: ["workspace/b.py"],
    });
    expect(afterState?.activeTargets).toEqual(["workspace/b.py"]);
  });

  it("prunes broad shadowed goals when a newer active subgoal exactly covers the unresolved remainder", async () => {
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "main",
      task: "fix module and test together",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: ["workspace/a.py", "workspace/b.py"],
      },
      outcome: {
        status: "error",
        errorKind: "target_not_touched",
        observedChangedFiles: [],
        writeOk: false,
      },
    });
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "main",
      task: "fix module only",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: ["workspace/a.py"],
      },
      outcome: {
        status: "ok",
        observedChangedFiles: ["workspace/a.py"],
        writeOk: true,
      },
    });
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "main",
      task: "fix test only",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: ["workspace/b.py"],
      },
      outcome: {
        status: "error",
        errorKind: "target_not_touched",
        observedChangedFiles: [],
        writeOk: false,
      },
    });

    const before = await loadOmegaSelfTimeKernel({
      workspaceRoot,
      sessionKey: "main",
    });
    expect(deriveShadowedGoalTasks(before)).toEqual(["fix module and test together"]);

    const pruned = await pruneShadowedOmegaGoals({
      workspaceRoot,
      sessionKey: "main",
    });
    const afterKernel = await loadOmegaSelfTimeKernel({
      workspaceRoot,
      sessionKey: "main",
    });
    const afterState = await loadOmegaSessionSelfState({
      workspaceRoot,
      sessionKey: "main",
    });

    expect(pruned.prunedGoalTasks).toEqual(["fix module and test together"]);
    expect(afterKernel?.goals.some((goal) => goal.task === "fix module and test together")).toBe(false);
    expect(afterKernel?.activeGoalId).toBeDefined();
    expect(afterKernel?.goals.some((goal) => goal.task === "fix test only" && goal.status === "active")).toBe(true);
    expect(afterState).toMatchObject({
      activeGoal: "fix test only",
      activeTargets: ["workspace/b.py"],
    });
  });
});
