import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  loadOmegaEmpiricalMetrics,
  recordOmegaBackgroundActionMetrics,
  recordOmegaRouteMetrics,
  recordOmegaValidationMetrics,
  resolveOmegaEmpiricalMetricsFile,
} from "./empirical-metrics.js";

const tmpDirs: string[] = [];

async function createWorkspaceRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "openskynet-omega-metrics-"));
  tmpDirs.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    tmpDirs.splice(0, tmpDirs.length).map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
});

describe("omega empirical metrics", () => {
  it("returns default metrics when the file does not exist", async () => {
    const workspaceRoot = await createWorkspaceRoot();

    const metrics = await loadOmegaEmpiricalMetrics({ workspaceRoot });

    expect(metrics.validation.recordedOutcomes).toBe(0);
    expect(metrics.routing.toolTasks).toBe(0);
    expect(metrics.background.usefulActions).toBe(0);
  });

  it("tracks validated outcomes and prevented false successes", async () => {
    const workspaceRoot = await createWorkspaceRoot();

    await recordOmegaValidationMetrics({
      workspaceRoot,
      validation: {
        expectsJson: true,
        expectedKeys: ["status"],
        expectedPaths: [],
      },
      outcome: {
        status: "error",
        errorKind: "invalid_structured_result",
      },
    });
    await recordOmegaValidationMetrics({
      workspaceRoot,
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: [],
      },
      outcome: {
        status: "ok",
      },
    });

    const metrics = await loadOmegaEmpiricalMetrics({ workspaceRoot });

    expect(metrics.validation.recordedOutcomes).toBe(2);
    expect(metrics.validation.validatedOutcomes).toBe(1);
    expect(metrics.validation.preventedFalseSuccesses).toBe(1);
    expect(metrics.validation.falseSuccessRate).toBe(1);
  });

  it("tracks route counts, llm call estimates, and useful background actions", async () => {
    const workspaceRoot = await createWorkspaceRoot();

    await recordOmegaRouteMetrics({
      workspaceRoot,
      route: "frontal_cache",
      llmCallsEstimated: 0,
      llmCallsSaved: 1,
    });
    await recordOmegaRouteMetrics({
      workspaceRoot,
      route: "sessions_spawn",
      llmCallsEstimated: 1,
    });
    await recordOmegaBackgroundActionMetrics({
      workspaceRoot,
      usefulActions: 2,
    });

    const metrics = await loadOmegaEmpiricalMetrics({ workspaceRoot });

    expect(metrics.routing.toolTasks).toBe(2);
    expect(metrics.routing.llmCallsEstimated).toBe(1);
    expect(metrics.routing.llmCallsSaved).toBe(1);
    expect(metrics.routing.meanLlmCallsPerToolTask).toBe(0.5);
    expect(metrics.routing.routeCounts).toMatchObject({
      frontal_cache: 1,
      sessions_spawn: 1,
    });
    expect(metrics.background.usefulActions).toBe(2);
    await expect(fs.readFile(resolveOmegaEmpiricalMetricsFile(workspaceRoot), "utf-8")).resolves.toContain(
      '"llmCallsSaved": 1',
    );
  });
});
