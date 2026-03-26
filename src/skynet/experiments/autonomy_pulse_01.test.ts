import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deriveSkynetAutonomyPulse01, runSkynetAutonomyPulse01 } from "./autonomy_pulse_01.js";

describe("skynet autonomy pulse 01", () => {
  let workspaceRoot = "";

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skynet-autonomy-pulse-"));
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it("derives an intensify verdict under strong initiative pressure", () => {
    const result = deriveSkynetAutonomyPulse01({
      sessionKey: "agent:openskynet:main",
      continuity: {
        sessionKey: "agent:openskynet:main",
        updatedAt: 1,
        cycleCount: 3,
        currentFocusKey: "endogenous_science_agenda",
        currentMode: "explore",
        focusStreak: 3,
        retainedItemIds: ["focus-experiment"],
        modeShiftCount: 0,
        continuityScore: 0.92,
      },
      nucleus: {
        sessionKey: "agent:openskynet:main",
        updatedAt: 1,
        name: "Skynet",
        mode: "explore",
        executive: {
          macroGoal: "Advance agenda",
          activeQuestion: "What study line should survive?",
          commitment: 0.78,
        },
        metabolism: {
          budget: 0.8,
          strain: 0.2,
          curiosity: 0.81,
          conservationBias: 0.4,
        },
        patternField: {
          coherence: 0.6,
          plasticity: 0.75,
          localityBias: 0.55,
        },
        supportingStudyTrack: "endogenous_science_agenda",
        supportingAgendaClassKeys: ["initiative:autonomy_improvement"],
        learnedConstraints: [],
      },
      commitment: {
        sessionKey: "agent:openskynet:main",
        updatedAt: 1,
        kind: "artifact",
        artifactKind: "module",
        targetFocusKey: "endogenous_science_agenda",
        chosenWorkItemId: "focus-experiment",
        chosenWorkItemTitle: "Empujar foco activo",
        rationale: "Continuity is strong.",
        executableTask: "Implement one executable Skynet study artifact.",
        confidence: 0.83,
      },
      experiment: {
        sessionKey: "agent:openskynet:main",
        updatedAt: 1,
        focusKey: "endogenous_science_agenda",
        mode: "explore",
        hypothesis: "Need artifact per cycle.",
        deliverable: "Create executable experiment/module.",
        killCriteria: "Kill if no artifact.",
        benchmarkHook: "Measure carry-over.",
        notes: [],
      },
      program: {
        sessionKey: "agent:openskynet:main",
        updatedAt: 1,
        focusKey: "endogenous_science_agenda",
        mode: "explore",
        items: [
          {
            id: "focus-experiment",
            title: "Empujar foco activo",
            trackKey: "endogenous_science_agenda",
            priority: 0.68,
            rationale: "Need persistent agenda.",
            deliverable: "Make artifact.",
            doneWhen: "Artifact exists.",
          },
        ],
      },
    });

    expect(result.verdict).toBe("intensify");
    expect(result.initiativePressure).toBeGreaterThan(0.78);
  });

  it("writes experiment artifacts using the real skynet pulse chain", async () => {
    const result = await runSkynetAutonomyPulse01({
      workspaceRoot,
      sessionKey: "agent:openskynet:main",
    });

    expect(result.topWorkItem).toContain("Empujar foco activo");
    expect(
      await fs.readFile(
        path.join(workspaceRoot, "memory", "SKYNET_EXPERIMENT_AUTONOMY_PULSE_01.md"),
        "utf-8",
      ),
    ).toContain("# SKYNET Experiment - Autonomy Pulse 01");
  });
});
