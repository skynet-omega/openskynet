import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyOmegaHeartbeatExecutiveAction } from "./heartbeat.js";
import { recordOmegaOperationalTurnMemory } from "./operational-memory.js";
import { loadOmegaSessionSelfState, recordOmegaSessionOutcome } from "./session-context.js";

type RetryWallSummary = {
  attempts: number;
  blindRetries: number;
  repeatedFailures: number;
  success: boolean;
};

const tmpDirs: string[] = [];

async function createWorkspaceRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "openskynet-omega-reframe-benchmark-"));
  tmpDirs.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    tmpDirs.splice(0, tmpDirs.length).map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
});

async function seedPartialProgressWall(params: {
  workspaceRoot: string;
  sessionKey: string;
  resolvedTarget: string;
  unresolvedTarget: string;
}): Promise<void> {
  await recordOmegaSessionOutcome({
    workspaceRoot: params.workspaceRoot,
    sessionKey: params.sessionKey,
    task: `repair ${params.resolvedTarget} and ${params.unresolvedTarget}`,
    validation: {
      expectsJson: false,
      expectedKeys: [],
      expectedPaths: [params.resolvedTarget, params.unresolvedTarget],
    },
    outcome: {
      status: "error",
      errorKind: "target_not_touched",
      observedChangedFiles: [],
      writeOk: false,
    },
    reply: "failed",
  });
  await recordOmegaSessionOutcome({
    workspaceRoot: params.workspaceRoot,
    sessionKey: params.sessionKey,
    task: `repair ${params.resolvedTarget}`,
    validation: {
      expectsJson: false,
      expectedKeys: [],
      expectedPaths: [params.resolvedTarget],
    },
    outcome: {
      status: "ok",
      observedChangedFiles: [params.resolvedTarget],
      writeOk: true,
    },
    reply: "partial",
  });
  for (let iteration = 1; iteration <= 2; iteration += 1) {
    await recordOmegaOperationalTurnMemory({
      workspaceRoot: params.workspaceRoot,
      sessionKey: params.sessionKey,
      turn: {
        iteration,
        terminationReason: "continue",
        stateDelta: {
          timelineDelta: 0,
          kernelUpdated: false,
          progressObserved: false,
        },
        latencyBreakdown: {
          sendAgentTurnMs: 10,
          loadSnapshotMs: 10,
          readLatestReplyMs: 0,
          totalMs: 25,
        },
      },
      turnPolicy: {
        continueDelayMs: 7_500,
        shouldBackoff: true,
        turnHealth: "stalled",
      },
    });
  }
}

async function runPartialProgressWallEpisode(params: {
  workspaceRoot: string;
  sessionKey: string;
  resolvedTarget: string;
  unresolvedTarget: string;
  useReframe: boolean;
}): Promise<RetryWallSummary> {
  await seedPartialProgressWall(params);

  if (params.useReframe) {
    const executiveResult = await applyOmegaHeartbeatExecutiveAction({
      workspaceRoot: params.workspaceRoot,
      sessionKey: params.sessionKey,
    });
    expect(executiveResult).toMatchObject({
      kind: "reframed_stalled_goal",
      focusedTargets: [params.unresolvedTarget],
    });
    const state = await loadOmegaSessionSelfState({
      workspaceRoot: params.workspaceRoot,
      sessionKey: params.sessionKey,
    });
    expect(state?.learnedConstraints).toContain("reframe_before_retry");
    expect(state?.learnedConstraints).toContain("narrow_to_unresolved_targets");
  }

  let attempts = 0;
  let blindRetries = 0;
  let repeatedFailures = 0;
  let success = false;

  while (attempts < 3 && !success) {
    attempts += 1;
    const state = await loadOmegaSessionSelfState({
      workspaceRoot: params.workspaceRoot,
      sessionKey: params.sessionKey,
    });
    const activeTargets = state?.activeTargets ?? [];
    const narrowedToUnresolvedOnly =
      activeTargets.length === 1 && activeTargets[0] === params.unresolvedTarget;

    if (narrowedToUnresolvedOnly) {
      await recordOmegaSessionOutcome({
        workspaceRoot: params.workspaceRoot,
        sessionKey: params.sessionKey,
        task: `repair ${params.unresolvedTarget}`,
        validation: {
          expectsJson: false,
          expectedKeys: [],
          expectedPaths: [params.unresolvedTarget],
        },
        outcome: {
          status: "ok",
          observedChangedFiles: [params.unresolvedTarget],
          writeOk: true,
        },
        reply: "resolved",
      });
      success = true;
      break;
    }

    blindRetries += 1;
    repeatedFailures += 1;
    await recordOmegaSessionOutcome({
      workspaceRoot: params.workspaceRoot,
      sessionKey: params.sessionKey,
      task: `repair ${params.resolvedTarget} and ${params.unresolvedTarget}`,
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: [params.resolvedTarget, params.unresolvedTarget],
      },
      outcome: {
        status: "error",
        errorKind: "target_not_touched",
        observedChangedFiles: [params.resolvedTarget],
        writeOk: false,
      },
      reply: "still missing unresolved target",
    });
  }

  return { attempts, blindRetries, repeatedFailures, success };
}

describe("omega heartbeat reframe benchmark", () => {
  it("reduces repeated failure and retries after learned reframe constraints narrow the target set", async () => {
    const episodes = Array.from({ length: 12 }, (_, index) => ({
      resolvedTarget: `workspace/resolved-${index}.ts`,
      unresolvedTarget: `workspace/unresolved-${index}.ts`,
    }));

    const baseline = { attempts: 0, blindRetries: 0, repeatedFailures: 0, successes: 0 };
    const treatment = { attempts: 0, blindRetries: 0, repeatedFailures: 0, successes: 0 };

    for (const [index, episode] of episodes.entries()) {
      const baselineWorkspaceRoot = await createWorkspaceRoot();
      const baselineResult = await runPartialProgressWallEpisode({
        workspaceRoot: baselineWorkspaceRoot,
        sessionKey: `baseline:${index}`,
        useReframe: false,
        ...episode,
      });
      baseline.attempts += baselineResult.attempts;
      baseline.blindRetries += baselineResult.blindRetries;
      baseline.repeatedFailures += baselineResult.repeatedFailures;
      baseline.successes += baselineResult.success ? 1 : 0;

      const treatmentWorkspaceRoot = await createWorkspaceRoot();
      const treatmentResult = await runPartialProgressWallEpisode({
        workspaceRoot: treatmentWorkspaceRoot,
        sessionKey: `treatment:${index}`,
        useReframe: true,
        ...episode,
      });
      treatment.attempts += treatmentResult.attempts;
      treatment.blindRetries += treatmentResult.blindRetries;
      treatment.repeatedFailures += treatmentResult.repeatedFailures;
      treatment.successes += treatmentResult.success ? 1 : 0;
    }

    expect(baseline).toMatchObject({
      attempts: 36,
      blindRetries: 36,
      repeatedFailures: 36,
      successes: 0,
    });
    expect(treatment).toMatchObject({
      attempts: 12,
      blindRetries: 0,
      repeatedFailures: 0,
      successes: 12,
    });
    expect(treatment.attempts).toBeLessThan(baseline.attempts);
    expect(treatment.blindRetries).toBeLessThan(baseline.blindRetries);
    expect(treatment.repeatedFailures).toBeLessThan(baseline.repeatedFailures);
  });
});
