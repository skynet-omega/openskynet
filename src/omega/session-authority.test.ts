import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadOmegaSessionAuthority, resolveOmegaSessionStateFile } from "./session-context.js";

describe("omega session authority", () => {
  let workspaceRoot = "";

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "omega-session-authority-"));
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it("loads timeline, state, kernel, and transactions from one canonical session snapshot", async () => {
    const sessionKey = "agent:openskynet:main";
    const filePath = resolveOmegaSessionStateFile({ workspaceRoot, sessionKey });
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(
      filePath,
      JSON.stringify(
        {
          sessionKey,
          updatedAt: Date.now(),
          entries: [
            {
              createdAt: 1,
              task: "test authority",
              validation: { expectsJson: false, expectedKeys: [], expectedPaths: [] },
              outcome: { status: "ok" },
            },
          ],
          state: {
            activeTargets: ["src/example.ts"],
            requiredKeys: [],
            learnedConstraints: ["stay falsifiable"],
            updatedAt: 1,
          },
          kernel: {
            revision: 1,
            sessionKey,
            turnCount: 1,
            identity: { continuityId: "cid", firstSeenAt: 1, lastSeenAt: 1 },
            world: { lastObservedChangedFiles: [] },
            goals: [],
            tension: {
              openGoalCount: 0,
              staleGoalCount: 0,
              failureStreak: 0,
              repeatedFailureKinds: [],
              pendingCorrection: false,
            },
            causalGraph: { files: [], edges: [] },
            updatedAt: 1,
          },
          transactions: [
            {
              id: "tx-1",
              task: "apply change",
              createdAt: 1,
              updatedAt: 1,
              status: "active",
              validation: {
                expectsJson: false,
                expectedKeys: [],
                expectedPaths: [],
              },
              attempts: [],
              verifiedOutcome: {
                status: "ok",
                observedChangedFiles: [],
              },
              nextRecoveryStep: {
                kind: "none",
                reason: "no_verified_recovery_step",
                remainingTargets: [],
                requiredKeys: [],
              },
            },
          ],
        },
        null,
        2,
      ),
      "utf-8",
    );

    const snapshot = await loadOmegaSessionAuthority({ workspaceRoot, sessionKey });

    expect(snapshot.timeline).toHaveLength(1);
    expect(snapshot.state?.learnedConstraints).toEqual(["stay falsifiable"]);
    expect(snapshot.kernel?.identity.continuityId).toBe("cid");
    expect(snapshot.transactions).toHaveLength(1);
  });
});
