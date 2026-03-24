import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, vi } from "vitest";
import * as executiveStateModule from "./executive-state.js";
import { buildOmegaHeartbeatPrompt } from "./heartbeat.js";
import { recordOmegaSessionOutcome } from "./session-context.js";
import { loadOmegaWorldModelSnapshot } from "./world-model.js";

async function createWorkspaceRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "omega-symbiosis-test-"));
  return root;
}

describe("Omega Architectural Symbiosis", () => {
  it("closes the autonomous loop: Failure -> Global Memory -> Agenda -> Induced Hypothesis", async () => {
    const workspaceRoot = await createWorkspaceRoot();
    const sessionA = "session-a";
    const task = "refactor authentication logic";
    const targets = ["src/auth.ts"];

    // 1. SESSION A: Fail repeatedly to trigger a failure pattern in the agenda
    for (let i = 0; i < 2; i++) {
      await recordOmegaSessionOutcome({
        workspaceRoot,
        sessionKey: sessionA,
        task,
        validation: { expectsJson: false, expectedKeys: [], expectedPaths: targets },
        outcome: { status: "error", errorKind: "missing_target_writes" },
      });
    }

    // 2. BACKGROUND: The system should now have a "failure:missing_target_writes" agenda item
    // and it should be visible to any session in the workspace.
    const sessionB = "session-b";
    const worldB = await loadOmegaWorldModelSnapshot({
      workspaceRoot,
      sessionKey: sessionB,
      task: "unrelated task",
    });

    const agendaItem = worldB.problemAgenda.find(
      (i) => i.classKey === "failure:missing_target_writes",
    );
    expect(agendaItem).toBeDefined();
    expect(agendaItem?.priority).toBeGreaterThan(0.5);

    // 3. HEARTBEAT: Simulate a heartbeat in Session B that decides to work on this agenda item
    // We mock the executive state to select this agenda item
    const mockSync = vi
      .spyOn(executiveStateModule, "syncOmegaExecutiveObserverState")
      .mockResolvedValue({
        sessionKey: sessionB,
        revision: 1,
        updatedAt: Date.now(),
        syncFingerprint: "mock",
        observer: {
          mode: "active",
          queue: [],
          maintenanceQueue: [],
          anomalies: [],
          decision: {
            mode: "active",
            selectedAction: "maintain",
            selectedGoalId: "maintenance:failure:missing_target_writes",
            rationale: [],
            expectedUtility: 1,
            utilityBreakdown: {
              taskProgressGain: 1,
              uncertaintyReduction: 1,
              futureFailureRiskReduction: 1,
              tokenCost: 0,
              wallTimeCost: 0,
              disruptionCost: 0,
              total: 1,
            },
            confidence: 1,
            budget: {
              maxTurnsPerCycle: 1,
              maxLlmCalls: 1,
              maxWallTimeMs: 1000,
            },
            budgetUsage: {
              budgetPressure: 0,
              estimatedLlmCalls: 0,
              observedTurns: 0,
              observedWallTimeMs: 0,
            },
          },
        },
        memory: {
          health: "stable",
          promotionCandidates: 0,
          revalidationCandidates: 0,
          repeatedFailurePatterns: [],
          recentUsefulSuccesses: 0,
        },
        runtime: {
          lastSyncedAt: Date.now(),
          dispatchAccounting: {
            totalCycles: 0,
            llmDispatches: 0,
            deferredCycles: 0,
            queueDispatchCounts: { goal: 0, maintenance: 0, anomaly: 0 },
            recentSelectedWorkItemIds: [],
            recentDispatchedWorkItemIds: [],
            workItemLedger: [],
          },
          dispatchPlan: {
            shouldDispatchLlmTurn: true,
            selectedAction: "maintain",
            queueKind: "maintenance",
            selectedWorkItemId: "maintenance:failure:missing_target_writes",
            expectedUtility: 1,
            utilityBreakdown: {
              taskProgressGain: 0,
              uncertaintyReduction: 1,
              futureFailureRiskReduction: 0,
              tokenCost: 0,
              wallTimeCost: 0,
              disruptionCost: 0,
              total: 1,
            },
            budgetUsage: {
              budgetPressure: 0,
              estimatedLlmCalls: 0,
              observedTurns: 0,
              observedWallTimeMs: 0,
            },
            estimatedDispatchCostMs: 0,
            queueDepths: { goals: 0, anomalies: 0, maintenance: 1 },
            scheduledItems: [
              {
                id: "maintenance:failure:missing_target_writes",
                queueKind: "maintenance",
                action: "maintain",
                priority: 1,
                detail: "failure:missing_target_writes",
              },
            ],
            nextWakeDelayMs: 0,
            rationale: ["Mocked for testing"],
          },
        },
      });

    const prompt = await buildOmegaHeartbeatPrompt({
      workspaceRoot,
      sessionKey: sessionB,
    });

    mockSync.mockRestore();

    // 4. VERIFY: The prompt should contain the INDUCED hypothesis, not a static template
    expect(prompt).toBeDefined();
    if (!prompt) throw new Error("Prompt is undefined");
    console.log("Induced Heartbeat Prompt:\n", prompt);

    expect(prompt).toContain("[OMEGA Initiative Contract]");
    expect(prompt).toContain("Hypothesis:");
    // It should contain context from the failure in Session A
    expect(prompt).toContain("missing_target_writes");
    expect(prompt).toContain(task);
    expect(prompt).toContain(targets[0]);

    // Cleanup
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });
});
