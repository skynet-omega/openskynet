import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  deriveSkynetDecisionBifurcationProbe,
  runSkynetDecisionBifurcationProbe,
} from "./decision-bifurcation-probe.js";

describe("skynet decision bifurcation probe", () => {
  let workspaceRoot = "";

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skynet-bifurcation-probe-"));
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it("branches when stalled pressure is high", () => {
    const result = deriveSkynetDecisionBifurcationProbe({
      sessionKey: "agent:openskynet:main",
      stalledTurns: 2,
      continuity: {
        sessionKey: "agent:openskynet:main",
        updatedAt: 1,
        projectName: "Skynet",
        cycleCount: 2,
        currentFocusKey: "decision_bifurcation",
        currentMode: "reframe",
        focusStreak: 2,
        retainedItemIds: ["focus-experiment"],
        modeShiftCount: 0,
        continuityScore: 0.73,
      },
      nucleus: {
        sessionKey: "agent:openskynet:main",
        updatedAt: 1,
        name: "Skynet",
        mode: "reframe",
        executive: {
          macroGoal: "Reframe the plan",
          activeQuestion: "What stabilizes commitment?",
          commitment: 0.74,
        },
        metabolism: {
          budget: 0.6,
          strain: 0.4,
          curiosity: 0.68,
          conservationBias: 0.5,
        },
        patternField: {
          coherence: 0.58,
          plasticity: 0.72,
          localityBias: 0.55,
        },
        supportingStudyTrack: "decision_bifurcation",
        supportingAgendaClassKeys: ["initiative:stalled_progress"],
        learnedConstraints: [],
      },
      commitment: {
        sessionKey: "agent:openskynet:main",
        updatedAt: 1,
        projectName: "Skynet",
        kind: "reframe",
        artifactKind: "note",
        targetFocusKey: "decision_bifurcation",
        chosenWorkItemId: "stability-bridge",
        chosenWorkItemTitle: "Reencuadrar el núcleo antes de insistir",
        rationale: "Need branch.",
        executableTask: "Produce reframe artifact.",
        confidence: 0.76,
      },
      experiment: {
        sessionKey: "agent:openskynet:main",
        updatedAt: 1,
        projectName: "Skynet",
        focusKey: "decision_bifurcation",
        mode: "reframe",
        hypothesis: "Need branch.",
        deliverable: "Produce alternate framing.",
        killCriteria: "Kill if plan does not change.",
        benchmarkHook: "Measure route change.",
        notes: [],
      },
      program: {
        sessionKey: "agent:openskynet:main",
        updatedAt: 1,
        projectName: "Skynet",
        focusKey: "decision_bifurcation",
        mode: "reframe",
        items: [
          {
            id: "stability-bridge",
            title: "Reencuadrar el núcleo antes de insistir",
            trackKey: "decision_bifurcation",
            priority: 0.66,
            rationale: "Need branch.",
            deliverable: "Produce alternate framing.",
            doneWhen: "Plan changes materially.",
          },
        ],
      },
    });

    expect(result.verdict).toBe("branch");
    expect(result.bifurcationPressure).toBeGreaterThan(0.68);
  });

  it("writes probe artifacts using the real world-model chain", async () => {
    const result = await runSkynetDecisionBifurcationProbe({
      workspaceRoot,
      sessionKey: "agent:openskynet:main",
    });

    expect(["hold", "branch", "commit"]).toContain(result.verdict);
    expect(
      await fs.readFile(
        path.join(workspaceRoot, "memory", "SKYNET_DECISION_BIFURCATION_PROBE.md"),
        "utf-8",
      ),
    ).toContain("# SKYNET Decision Bifurcation Probe");
  });
});
