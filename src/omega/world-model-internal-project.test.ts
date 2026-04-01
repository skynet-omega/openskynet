import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  formatOmegaWorldModelInternalProjectBlocks,
  loadOmegaWorldModelInternalProjectState,
} from "./world-model-internal-project.js";

describe("omega world model internal project", () => {
  let workspaceRoot = "";

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "omega-world-model-internal-"));
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it("returns empty state when no study supervisor is available", async () => {
    const degradedComponents: Array<{ component: string; reason: string }> = [];

    const state = await loadOmegaWorldModelInternalProjectState({
      workspaceRoot,
      sessionKey: "agent:main:main",
      projectName: "Protein Lab",
      studySupervisor: undefined,
      operationalSignals: [],
      learnedConstraints: [],
      degradedComponents,
    });

    expect(state).toEqual({
      internalProjectNucleus: undefined,
      internalProjectStudyProgram: undefined,
      internalProjectContinuity: undefined,
    });
    expect(degradedComponents).toEqual([]);
  });

  it("formats internal project blocks when state is present", () => {
    const now = Date.now();
    const lines = formatOmegaWorldModelInternalProjectBlocks({
      internalProjectNucleus: {
        sessionKey: "agent:main:main",
        updatedAt: now,
        name: "Protein Lab",
        mode: "explore",
        executive: {
          macroGoal: "Map active frontier",
          activeQuestion: "What to explore next?",
          commitment: 0.75,
        },
        metabolism: {
          budget: 0.7,
          strain: 0.2,
          curiosity: 0.9,
          conservationBias: 0.1,
        },
        patternField: {
          coherence: 0.8,
          plasticity: 0.6,
          localityBias: 0.4,
        },
        supportingStudyTrack: "endogenous_science_agenda",
        supportingAgendaClassKeys: ["initiative:autonomy_improvement"],
        learnedConstraints: ["prefer_verified_recovery"],
      },
      internalProjectStudyProgram: {
        sessionKey: "agent:main:main",
        updatedAt: now,
        projectName: "Protein Lab",
        focusKey: "endogenous_science_agenda",
        mode: "explore",
        items: [
          {
            id: "item-1",
            title: "Empujar foco activo",
            trackKey: "endogenous_science_agenda",
            priority: 1,
            rationale: "Keep momentum",
            deliverable: "Fresh observations",
            doneWhen: "There is a concrete new lead",
          },
        ],
      },
      internalProjectContinuity: {
        sessionKey: "agent:main:main",
        updatedAt: now,
        projectName: "Protein Lab",
        cycleCount: 3,
        currentFocusKey: "endogenous_science_agenda",
        currentMode: "explore",
        focusStreak: 1,
        retainedItemIds: ["item-1"],
        modeShiftCount: 0,
        continuityScore: 0.82,
      },
    });

    expect(lines.join("\n")).toContain("[Protein Lab Nucleus]");
    expect(lines.join("\n")).toContain("[Protein Lab Study Program]");
    expect(lines.join("\n")).toContain("[Protein Lab Continuity]");
  });
});
