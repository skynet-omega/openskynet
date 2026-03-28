import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deriveSkynetNucleusState } from "./nucleus.js";
import { deriveSkynetStudyProgram, syncSkynetStudyProgram } from "./study-program.js";

describe("skynet study program", () => {
  let workspaceRoot = "";

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skynet-study-program-"));
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it("derives concrete work items from the current focus and nucleus mode", () => {
    const nucleus = deriveSkynetNucleusState({
      sessionKey: "agent:openskynet:main",
      studyFocus: {
        key: "endogenous_science_agenda",
        title: "Agenda científica endógena",
        thesis: "Persist a study agenda across cycles.",
        whyNow: "No persistent agenda exists yet.",
        nextExperiment: "Define a persistent study queue.",
        successCriteria: "A concrete queue is produced.",
        priority: 0.62,
        supportingAgendaClassKeys: ["initiative:autonomy_improvement"],
      },
      operationalSignals: [],
      learnedConstraints: [],
    });

    const program = deriveSkynetStudyProgram({
      sessionKey: "agent:openskynet:main",
      supervisor: {
        sessionKey: "agent:openskynet:main",
        updatedAt: 1,
        focus: {
          key: "endogenous_science_agenda",
          title: "Agenda científica endógena",
          thesis: "Persist a study agenda across cycles.",
          whyNow: "No persistent agenda exists yet.",
          nextExperiment: "Define a persistent study queue.",
          successCriteria: "A concrete queue is produced.",
          priority: 0.62,
          supportingAgendaClassKeys: ["initiative:autonomy_improvement"],
        },
        tracks: [
          {
            key: "endogenous_science_agenda",
            title: "Agenda científica endógena",
            thesis: "Persist a study agenda across cycles.",
            whyNow: "No persistent agenda exists yet.",
            nextExperiment: "Define a persistent study queue.",
            successCriteria: "A concrete queue is produced.",
            priority: 0.62,
            evidence: ["Agenda still open."],
            supportingAgendaClassKeys: ["initiative:autonomy_improvement"],
            lastUpdatedAt: 1,
          },
          {
            key: "bicameral_core",
            title: "Núcleo dual o bicameral",
            thesis: "Separate executive logic from dynamic pattern processing.",
            whyNow: "The stack remains monolithic.",
            nextExperiment: "Define the dual prototype.",
            successCriteria: "A causal interface exists.",
            priority: 0.56,
            evidence: ["Historic line survives."],
            supportingAgendaClassKeys: ["initiative:autonomy_improvement"],
            lastUpdatedAt: 1,
          },
          {
            key: "cognitive_metabolism",
            title: "Metabolismo cognitivo real",
            thesis: "Thinking should have cost.",
            whyNow: "Loop cost still diffuses.",
            nextExperiment: "Measure metabolic strain.",
            successCriteria: "Budget changes behavior.",
            priority: 0.51,
            evidence: ["Metabolic debt remains."],
            supportingAgendaClassKeys: ["initiative:somatic_optimization"],
            lastUpdatedAt: 1,
          },
        ],
      },
      nucleus,
    });

    expect(program.items).toHaveLength(3);
    expect(program.items[0]?.trackKey).toBe("endogenous_science_agenda");
    expect(program.items[0]?.deliverable).toContain("Define a persistent study queue");
    expect(program.items[2]?.title).toContain("bucle empírico");
  });

  it("persists the study program to json and markdown artifacts", async () => {
    const supervisor = {
      sessionKey: "agent:openskynet:main",
      updatedAt: 1,
      focus: {
        key: "decision_bifurcation" as const,
        title: "Decisión como bifurcación y estabilización",
        thesis: "Stabilize commitment.",
        whyNow: "Stalls were observed.",
        nextExperiment: "Produce a new reframe.",
        successCriteria: "The next plan changes materially.",
        priority: 0.59,
        supportingAgendaClassKeys: ["initiative:stalled_progress"],
      },
      tracks: [
        {
          key: "decision_bifurcation" as const,
          title: "Decisión como bifurcación y estabilización",
          thesis: "Stabilize commitment.",
          whyNow: "Stalls were observed.",
          nextExperiment: "Produce a new reframe.",
          successCriteria: "The next plan changes materially.",
          priority: 0.59,
          evidence: ["Repeated stalls."],
          supportingAgendaClassKeys: ["initiative:stalled_progress"],
          lastUpdatedAt: 1,
        },
        {
          key: "cognitive_metabolism" as const,
          title: "Metabolismo cognitivo real",
          thesis: "Thinking should have cost.",
          whyNow: "Loop cost still diffuses.",
          nextExperiment: "Measure metabolic strain.",
          successCriteria: "Budget changes behavior.",
          priority: 0.52,
          evidence: ["Metabolic debt remains."],
          supportingAgendaClassKeys: ["initiative:somatic_optimization"],
          lastUpdatedAt: 1,
        },
      ],
    };

    const nucleus = deriveSkynetNucleusState({
      sessionKey: "agent:openskynet:main",
      studyFocus: supervisor.focus,
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
            totalMs: 16000,
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
            totalMs: 15000,
          },
          causalImpact: 0,
        },
      ],
      learnedConstraints: [],
    });

    const program = await syncSkynetStudyProgram({
      workspaceRoot,
      sessionKey: "agent:openskynet:main",
      supervisor,
      nucleus,
    });

    expect(program.mode).toBe("reframe");
    const jsonPath = path.join(
      workspaceRoot,
      ".openskynet",
      "skynet-study-program",
      "agent_openskynet_main.json",
    );
    const markdownPath = path.join(workspaceRoot, "memory", "SKYNET_STUDY_PROGRAM.md");
    expect(JSON.parse(await fs.readFile(jsonPath, "utf-8")).items).toHaveLength(3);
    expect(await fs.readFile(markdownPath, "utf-8")).toContain("# SKYNET Study Program");
  });
});
