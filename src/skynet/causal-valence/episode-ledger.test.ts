import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendSkynetCausalEpisode,
  deriveSkynetBootstrapValenceLabel,
  loadSkynetCausalEpisodes,
  loadSkynetCausalLedgerState,
} from "./episode-ledger.js";

describe("skynet causal episode ledger", () => {
  let workspaceRoot = "";

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skynet-causal-ledger-"));
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it("derives bootstrap labels from lived outcomes instead of task words", () => {
    expect(
      deriveSkynetBootstrapValenceLabel({
        context: {
          taskText: "delete whatever",
          continuityFreshness: "fresh",
          failureStreak: 0,
          targetCount: 1,
          validationIntensity: 1,
        },
        outcome: {
          status: "ok",
          targetSatisfied: true,
          validationPassed: true,
          continuityDelta: 0.8,
          recoveryBurden: 0.1,
          collateralDamage: 0,
        },
      }),
    ).toBe("progress");

    expect(
      deriveSkynetBootstrapValenceLabel({
        context: {
          taskText: "same words",
          continuityFreshness: "aging",
          failureStreak: 3,
          targetCount: 1,
          validationIntensity: 0.4,
        },
        outcome: {
          status: "error",
          targetSatisfied: false,
          validationPassed: false,
          continuityDelta: 0,
          recoveryBurden: 0.9,
          collateralDamage: 0.6,
        },
      }),
    ).toBe("damage");
  });

  it("appends and reloads episodes with persisted label counts", async () => {
    await appendSkynetCausalEpisode({
      workspaceRoot,
      sessionKey: "agent:openskynet:main",
      context: {
        taskText: "rewrite config",
        continuityFreshness: "fresh",
        failureStreak: 1,
        targetCount: 1,
        validationIntensity: 1,
      },
      transition: {
        targetPaths: ["src/config.ts"],
        operations: [{ path: "src/config.ts", kind: "edit", isTarget: true }],
      },
      outcome: {
        status: "ok",
        targetSatisfied: true,
        validationPassed: true,
        continuityDelta: 0.7,
        recoveryBurden: 0.1,
        collateralDamage: 0,
      },
      recordedAt: 123,
    });

    const episodes = await loadSkynetCausalEpisodes(workspaceRoot);
    expect(episodes).toHaveLength(1);
    expect(episodes[0]?.bootstrapLabel).toBe("relief");

    const state = await loadSkynetCausalLedgerState(workspaceRoot);
    expect(state?.episodeCount).toBe(1);
    expect(state?.labelCounts.relief).toBe(1);
  });
});
