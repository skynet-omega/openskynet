import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { syncSkynetContinuityState } from "./continuity-tracker.js";
import { deriveSkynetNucleusState } from "./nucleus.js";
import { deriveSkynetStudyProgram } from "./study-program.js";

describe("skynet continuity tracker", () => {
  let workspaceRoot = "";

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skynet-continuity-"));
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it("increases focus streak across stable cycles and persists the score", async () => {
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

    const nucleus1 = deriveSkynetNucleusState({
      sessionKey: "agent:openskynet:main",
      studyFocus: focus,
      operationalSignals: [],
      learnedConstraints: [],
    });
    const program1 = deriveSkynetStudyProgram({
      sessionKey: "agent:openskynet:main",
      supervisor,
      nucleus: nucleus1,
    });
    const state1 = await syncSkynetContinuityState({
      workspaceRoot,
      sessionKey: "agent:openskynet:main",
      nucleus: nucleus1,
      program: program1,
    });

    const nucleus2 = deriveSkynetNucleusState({
      sessionKey: "agent:openskynet:main",
      studyFocus: focus,
      operationalSignals: [],
      learnedConstraints: [],
    });
    const program2 = deriveSkynetStudyProgram({
      sessionKey: "agent:openskynet:main",
      supervisor,
      nucleus: nucleus2,
    });
    const state2 = await syncSkynetContinuityState({
      workspaceRoot,
      sessionKey: "agent:openskynet:main",
      nucleus: nucleus2,
      program: program2,
    });

    expect(state1.focusStreak).toBe(1);
    expect(state2.focusStreak).toBe(2);
    expect(state2.continuityScore).toBeGreaterThan(state1.continuityScore);
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(
            workspaceRoot,
            ".openskynet",
            "skynet-continuity",
            "agent_openskynet_main.json",
          ),
          "utf-8",
        ),
      ).focusStreak,
    ).toBe(2);
  });
});
