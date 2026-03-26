import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { syncSkynetContinuityState } from "./continuity-tracker.js";
import { syncSkynetExperimentPlan } from "./experiment-cycle.js";
import { deriveSkynetNucleusState } from "./nucleus.js";
import { deriveSkynetStudyProgram } from "./study-program.js";

describe("skynet experiment cycle", () => {
  let workspaceRoot = "";

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skynet-experiment-"));
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it("persists an active experiment plan from current program and continuity", async () => {
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
      tracks: [
        {
          ...focus,
          evidence: ["Agenda still open."],
          lastUpdatedAt: 1,
        },
      ],
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
    const plan = await syncSkynetExperimentPlan({
      workspaceRoot,
      sessionKey: "agent:openskynet:main",
      nucleus,
      program,
      continuity,
    });

    expect(plan.focusKey).toBe("endogenous_science_agenda");
    expect(plan.deliverable).toContain("executable experiment/module");
    expect(
      await fs.readFile(path.join(workspaceRoot, "memory", "SKYNET_ACTIVE_EXPERIMENT.md"), "utf-8"),
    ).toContain("# SKYNET Active Experiment");
  });
});
