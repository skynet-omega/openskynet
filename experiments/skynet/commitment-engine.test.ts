import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  deriveSkynetCommitmentDecision,
  syncSkynetCommitmentDecision,
} from "./commitment-engine.js";
import { syncSkynetContinuityState } from "./continuity-tracker.js";
import { syncSkynetExperimentPlan } from "./experiment-cycle.js";
import { deriveSkynetNucleusState } from "./nucleus.js";
import { deriveSkynetStudyProgram } from "./study-program.js";

describe("skynet commitment engine", () => {
  let workspaceRoot = "";

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skynet-commitment-"));
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it("commits to an artifact when continuity is strong and mode is explore", async () => {
    const focus = {
      key: "endogenous_science_agenda" as const,
      title: "Agenda científica endógena",
      thesis: "Persist a study agenda across cycles.",
      whyNow: "No persistent agenda exists yet.",
      nextExperiment: "Define a persistent study queue.",
      successCriteria: "A concrete queue is produced.",
      priority: 0.62,
      supportingAgendaClassKeys: ["initiative:autonomy_improvement"],
    };
    const supervisor = {
      sessionKey: "agent:openskynet:main",
      updatedAt: 1,
      focus,
      tracks: [{ ...focus, evidence: ["Agenda still open."], lastUpdatedAt: 1 }],
    };
    const nucleus = deriveSkynetNucleusState({
      sessionKey: "agent:openskynet:main",
      studyFocus: focus,
      operationalSignals: [],
      learnedConstraints: [],
    });
    const program = deriveSkynetStudyProgram({
      sessionKey: "agent:openskynet:main",
      supervisor,
      nucleus,
    });
    const continuity = await syncSkynetContinuityState({
      workspaceRoot,
      sessionKey: "agent:openskynet:main",
      nucleus,
      program,
    });
    const experiment = await syncSkynetExperimentPlan({
      workspaceRoot,
      sessionKey: "agent:openskynet:main",
      nucleus,
      program,
      continuity,
    });

    const decision = deriveSkynetCommitmentDecision({
      sessionKey: "agent:openskynet:main",
      nucleus,
      program,
      experiment,
      continuity,
    });

    expect(decision.kind).toBe("artifact");
    expect(decision.artifactKind).toBe("module");
    expect(decision.executableTask).toContain("executable Skynet study artifact");
  });

  it("persists a commitment markdown and json artifact", async () => {
    const focus = {
      key: "decision_bifurcation" as const,
      title: "Decisión como bifurcación y estabilización",
      thesis: "Stabilize commitment.",
      whyNow: "Repeated stalls detected.",
      nextExperiment: "Produce a reframe.",
      successCriteria: "The plan changes materially.",
      priority: 0.6,
      supportingAgendaClassKeys: ["initiative:stalled_progress"],
    };
    const supervisor = {
      sessionKey: "agent:openskynet:main",
      updatedAt: 1,
      focus,
      tracks: [{ ...focus, evidence: ["Repeated stalls."], lastUpdatedAt: 1 }],
    };
    const nucleus = deriveSkynetNucleusState({
      sessionKey: "agent:openskynet:main",
      studyFocus: focus,
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
            readLatestReplyMs: 100,
            totalMs: 17000,
          },
          causalImpact: 0,
        },
        {
          id: "op-2",
          recordedAt: 2,
          iteration: 2,
          terminationReason: "completed",
          turnHealth: "stalled",
          progressObserved: false,
          timelineDelta: 0,
          kernelUpdated: true,
          latencyBreakdown: {
            sendAgentTurnMs: 1000,
            loadSnapshotMs: 100,
            readLatestReplyMs: 100,
            totalMs: 16000,
          },
          causalImpact: 0,
        },
      ],
      learnedConstraints: [],
    });
    const program = deriveSkynetStudyProgram({
      sessionKey: "agent:openskynet:main",
      supervisor,
      nucleus,
    });
    const continuity = await syncSkynetContinuityState({
      workspaceRoot,
      sessionKey: "agent:openskynet:main",
      nucleus,
      program,
    });
    const experiment = await syncSkynetExperimentPlan({
      workspaceRoot,
      sessionKey: "agent:openskynet:main",
      nucleus,
      program,
      continuity,
    });
    const decision = await syncSkynetCommitmentDecision({
      workspaceRoot,
      sessionKey: "agent:openskynet:main",
      nucleus,
      program,
      experiment,
      continuity,
    });

    expect(decision.kind).toBe("reframe");
    expect(
      await fs.readFile(path.join(workspaceRoot, "memory", "SKYNET_COMMITMENT.md"), "utf-8"),
    ).toContain("# SKYNET Commitment");
  });
});
