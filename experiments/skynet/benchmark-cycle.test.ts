import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveInternalProjectBenchmarkAuditFile } from "../../src/omega/internal-project.js";
import { runOmegaSelfTimeTick } from "../../src/omega/self-time-daemon.js";
import {
  resolveOpenSkynetBenchmarkCycleFile,
  resolveOpenSkynetBenchmarkCycleResultFile,
  syncOpenSkynetBenchmarkCycleSnapshot,
} from "./benchmark-cycle.js";

describe("benchmark cycle snapshot", () => {
  let workspaceRoot = "";

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openskynet-benchmark-cycle-"));
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it("writes a compact authoritative benchmark snapshot for autonomous cycles", async () => {
    await runOmegaSelfTimeTick({
      workspaceRoot,
      sessionKey: "agent:openskynet:main",
    });
    const snapshot = await syncOpenSkynetBenchmarkCycleSnapshot({
      workspaceRoot,
      sessionKey: "agent:openskynet:main",
    });

    expect(snapshot.project.name).toBe("Skynet");
    expect(snapshot.benchmark.focusKey).toBe("endogenous_science_agenda");
    expect(snapshot.benchmark.recommendedAction).toContain("Empujar foco activo");
    expect(snapshot.cycleRules.oneConcreteStepOnly).toBe(true);
    expect(snapshot.cycleRules.benchmarkSnapshotIsDerived).toBe(true);
    expect(snapshot.reportingRules.tone).toBe("sober");
    expect(snapshot.reportingRules.sourcePriority[0]).toContain(
      ".openskynet/internal-project-benchmark",
    );
    expect(snapshot.reportingRules.migrationDirective).toContain("OpenSkyNet/Omega");
    expect(snapshot.runtime.cycleResultFile).toContain("agent_openskynet_main-last-cycle.json");
    expect(snapshot.metabolism.budgetStatus).toBe("healthy");
    expect(snapshot.metabolism.killRecommended).toBe(false);
    expect(snapshot.acceptance.passing).toBe(false);
    expect(snapshot.selfTime?.tickCount).toBeGreaterThanOrEqual(1);
    expect(typeof snapshot.selfTime?.latestPredictionError).toBe("number");
    expect(snapshot.policyMutation?.candidateFile).toContain("policy-candidate.json");
    expect(["maintain", "advance"]).toContain(snapshot.coldDirective.action);
    expect(typeof snapshot.coldDirective.allowHotPath).toBe("boolean");
    if (snapshot.coldDirective.action === "maintain") {
      expect(snapshot.coldDirective.allowHotPath).toBe(false);
      expect(snapshot.coldDirective.enforcedWorkItemId).toMatch(/^maintenance:/);
      expect(snapshot.coldDirective.enforcedWorkItemDetail?.length ?? 0).toBeGreaterThan(0);
      expect(snapshot.coldDirective.maintenanceItemId).toMatch(/^maintenance:/);
      expect(snapshot.coldDirective.maintenanceDetail?.length ?? 0).toBeGreaterThan(0);
    }

    const filePath = resolveOpenSkynetBenchmarkCycleFile({
      workspaceRoot,
      sessionKey: "agent:openskynet:main",
    });
    const persisted = JSON.parse(await fs.readFile(filePath, "utf-8")) as {
      benchmark?: { score?: number; commitmentTask?: string | null };
    };
    expect(persisted.benchmark?.score).toBeGreaterThan(0);
    expect(persisted.benchmark?.commitmentTask).toContain("Implement one executable");
  });

  it("marks the benchmark as exhausted when configured no-progress budget is exceeded", async () => {
    await fs.writeFile(
      path.join(workspaceRoot, "INTERNAL_PROJECT.json"),
      JSON.stringify(
        {
          name: "Skynet",
          benchmarkPolicy: {
            maxNoProgressCycles: 1,
            maxCyclesWithoutImprovement: 4,
            maxCyclesWithoutArtifact: 5,
            measurementResetsImprovementStreak: false,
          },
        },
        null,
        2,
      ),
      "utf-8",
    );
    await fs.mkdir(path.join(workspaceRoot, ".openskynet", "internal-project-benchmark"), {
      recursive: true,
    });
    await fs.writeFile(
      resolveOpenSkynetBenchmarkCycleResultFile({
        workspaceRoot,
        sessionKey: "agent:openskynet:main",
      }),
      JSON.stringify(
        {
          cycleId: "cycle-1",
          result: {
            kind: "no-progress",
            artifactRef: null,
          },
        },
        null,
        2,
      ),
      "utf-8",
    );

    const snapshot = await syncOpenSkynetBenchmarkCycleSnapshot({
      workspaceRoot,
      sessionKey: "agent:openskynet:main",
    });

    expect(snapshot.metabolism.lastResultKind).toBe("no-progress");
    expect(snapshot.metabolism.noProgressStreak).toBe(1);
    expect(snapshot.metabolism.budgetStatus).toBe("exhausted");
    expect(snapshot.metabolism.killRecommended).toBe(true);
    expect(snapshot.metabolism.killReason).toContain("no_progress_budget_exhausted");
  });

  it("counts an autonomy-improvement artifact as real improvement and avoids false exhaustion", async () => {
    await fs.writeFile(
      resolveOpenSkynetBenchmarkCycleFile({
        workspaceRoot,
        sessionKey: "agent:openskynet:main",
      }),
      JSON.stringify(
        {
          metabolism: {
            evaluatedCycleCount: 3,
            lastEvaluatedCycleId: "cycle-3",
            lastResultKind: "measurement",
            lastArtifactRef: null,
            noProgressStreak: 0,
            cyclesSinceImprovement: 3,
            cyclesSinceArtifact: 1,
            budgetStatus: "warning",
            killRecommended: false,
            killReason: null,
          },
        },
        null,
        2,
      ),
      "utf-8",
    );
    await fs.writeFile(
      resolveOpenSkynetBenchmarkCycleResultFile({
        workspaceRoot,
        sessionKey: "agent:openskynet:main",
      }),
      JSON.stringify(
        {
          cycleId: "cycle-4",
          enforcedWorkItemId: "maintenance:agenda:initiative:autonomy_improvement",
          result: {
            kind: "artifact",
            artifactRef: "artifacts/autonomy-probe.py",
          },
        },
        null,
        2,
      ),
      "utf-8",
    );

    const snapshot = await syncOpenSkynetBenchmarkCycleSnapshot({
      workspaceRoot,
      sessionKey: "agent:openskynet:main",
    });

    expect(snapshot.metabolism.lastResultKind).toBe("artifact");
    expect(snapshot.metabolism.cyclesSinceImprovement).toBe(0);
    expect(snapshot.metabolism.budgetStatus).not.toBe("exhausted");
    expect(snapshot.metabolism.killRecommended).toBe(false);
  });

  it("passes acceptance when enough recent benchmark runs are clean and resultful", async () => {
    await fs.writeFile(
      path.join(workspaceRoot, "INTERNAL_PROJECT.json"),
      JSON.stringify(
        {
          benchmarkPolicy: {
            maxNoProgressCycles: 2,
            maxCyclesWithoutImprovement: 4,
            maxCyclesWithoutArtifact: 5,
            measurementResetsImprovementStreak: false,
            acceptanceWindowRuns: 3,
            requiredCleanRuns: 3,
            requiredResultfulRuns: 2,
          },
        },
        null,
        2,
      ),
      "utf-8",
    );
    const auditFile = resolveInternalProjectBenchmarkAuditFile({
      workspaceRoot,
      sessionKey: "agent:openskynet:main",
    });
    await fs.mkdir(path.dirname(auditFile), { recursive: true });
    await fs.writeFile(
      auditFile,
      [
        {
          runId: "r1",
          sessionKey: "agent:openskynet:main",
          startedAt: 1,
          endedAt: 2,
          status: "ok",
          resultKind: "artifact",
          contractClean: true,
          usedForbiddenSources: false,
          hasFreshCycleResult: true,
        },
        {
          runId: "r2",
          sessionKey: "agent:openskynet:main",
          startedAt: 3,
          endedAt: 4,
          status: "ok",
          resultKind: "measurement",
          contractClean: true,
          usedForbiddenSources: false,
          hasFreshCycleResult: true,
        },
        {
          runId: "r3",
          sessionKey: "agent:openskynet:main",
          startedAt: 5,
          endedAt: 6,
          status: "ok",
          resultKind: "no-progress",
          contractClean: true,
          usedForbiddenSources: false,
          hasFreshCycleResult: true,
        },
      ]
        .map((entry) => JSON.stringify(entry))
        .join("\n") + "\n",
      "utf-8",
    );

    const snapshot = await syncOpenSkynetBenchmarkCycleSnapshot({
      workspaceRoot,
      sessionKey: "agent:openskynet:main",
    });

    expect(snapshot.acceptance.recentRuns).toBe(3);
    expect(snapshot.acceptance.cleanRuns).toBe(3);
    expect(snapshot.acceptance.resultfulRuns).toBe(2);
    expect(snapshot.acceptance.passing).toBe(true);
  });
});
