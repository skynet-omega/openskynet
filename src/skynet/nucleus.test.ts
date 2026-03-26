import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deriveSkynetNucleusState, syncSkynetNucleus } from "./nucleus.js";

describe("skynet nucleus", () => {
  let workspaceRoot = "";

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skynet-nucleus-"));
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it("derives explore mode for endogenous study focus without recent stalls", () => {
    const state = deriveSkynetNucleusState({
      sessionKey: "agent:openskynet:main",
      studyFocus: {
        key: "endogenous_science_agenda",
        title: "Agenda científica endógena",
        thesis: "Persist a study agenda across cycles.",
        whyNow: "No persistent agenda exists yet.",
        nextExperiment: "Define a persistent study queue.",
        successCriteria: "A concrete queue is produced.",
        priority: 0.6,
        supportingAgendaClassKeys: ["initiative:autonomy_improvement"],
      },
      operationalSignals: [],
      learnedConstraints: [],
    });

    expect(state.name).toBe("Skynet");
    expect(state.mode).toBe("explore");
    expect(state.executive.activeQuestion).toContain("study line");
  });

  it("switches to reframe mode under stalled decision pressure and persists the state", async () => {
    const state = await syncSkynetNucleus({
      workspaceRoot,
      sessionKey: "agent:openskynet:main",
      studyFocus: {
        key: "decision_bifurcation",
        title: "Decisión como bifurcación y estabilización",
        thesis: "Stabilize commitment under tension.",
        whyNow: "Repeated stalls detected.",
        nextExperiment: "Produce a new reframe.",
        successCriteria: "The next plan materially changes.",
        priority: 0.58,
        supportingAgendaClassKeys: ["initiative:stalled_progress"],
      },
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
      learnedConstraints: ["touch_required_targets"],
    });

    expect(state.mode).toBe("reframe");
    expect(state.metabolism.strain).toBeGreaterThan(0.5);
    expect(state.patternField.localityBias).toBeGreaterThan(0.7);

    const persisted = JSON.parse(
      await fs.readFile(
        path.join(workspaceRoot, ".openskynet", "skynet-nucleus", "agent_openskynet_main.json"),
        "utf-8",
      ),
    );
    expect(persisted.name).toBe("Skynet");
    expect(persisted.mode).toBe("reframe");
  });
});
