import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendSkynetCausalEpisode } from "../causal-valence/episode-ledger.js";
import { runSkynetCausalValence01 } from "./causal_valence_01.js";

describe("skynet causal valence 01", () => {
  let workspaceRoot = "";

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skynet-causal-valence-01-"));
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it("writes benchmark artifacts from the isolated causal ledger", async () => {
    const seeds = [
      {
        label: "progress",
        kind: "edit",
        freshness: "fresh",
        failureStreak: 0,
        status: "ok",
        delta: 0.7,
        burden: 0.1,
        damage: 0,
        valid: true,
        targetSatisfied: true,
      },
      {
        label: "stall",
        kind: "noop",
        freshness: "aging",
        failureStreak: 1,
        status: "ok",
        delta: 0.05,
        burden: 0.2,
        damage: 0,
        valid: false,
        targetSatisfied: false,
      },
      {
        label: "damage",
        kind: "delete",
        freshness: "stale",
        failureStreak: 3,
        status: "error",
        delta: 0,
        burden: 0.9,
        damage: 0.7,
        valid: false,
        targetSatisfied: false,
      },
    ] as const;

    for (let round = 0; round < 4; round += 1) {
      for (const [index, seed] of seeds.entries()) {
        await appendSkynetCausalEpisode({
          workspaceRoot,
          sessionKey: "agent:openskynet:main",
          context: {
            taskText: `${seed.label}-${round}-${index}`,
            continuityFreshness: seed.freshness,
            failureStreak: seed.failureStreak,
            targetCount: 1,
            validationIntensity: seed.label === "progress" ? 1 : seed.label === "stall" ? 0.4 : 0.2,
          },
          transition: {
            targetPaths: ["src/app.ts"],
            operations:
              seed.kind === "delete"
                ? [
                    { path: "src/app.ts", kind: "delete", isTarget: true },
                    { path: `src/collateral-${round}-${index}.ts`, kind: "delete" },
                  ]
                : [{ path: "src/app.ts", kind: seed.kind, isTarget: true }],
          },
          outcome: {
            status: seed.status,
            targetSatisfied: seed.targetSatisfied,
            validationPassed: seed.valid,
            continuityDelta: seed.delta,
            recoveryBurden: seed.burden,
            collateralDamage: seed.damage,
          },
          recordedAt: round * 100 + index,
        });
      }
    }

    const result = await runSkynetCausalValence01({
      workspaceRoot,
      sessionKey: "agent:openskynet:main",
    });

    expect(result.status).toBe("pass");
    expect(result.evaluatedEpisodes).toBeGreaterThan(0);
    expect(
      await fs.readFile(
        path.join(workspaceRoot, "memory", "SKYNET_EXPERIMENT_CAUSAL_VALENCE_01.md"),
        "utf-8",
      ),
    ).toContain("# SKYNET Experiment - Causal Valence 01");
  });
});
