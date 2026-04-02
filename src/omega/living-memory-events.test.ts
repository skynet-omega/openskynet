import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendOpenSkynetLivingMemoryEvents,
  deriveOpenSkynetLivingMemoryEvents,
} from "./living-memory-events.js";
import type { OpenSkynetLivingState } from "./living-memory.js";

function buildState(overrides?: Partial<OpenSkynetLivingState>): OpenSkynetLivingState {
  const base: OpenSkynetLivingState = {
    sessionKey: "agent:main:main",
    updatedAt: 1,
    selfModel: {
      platform: { name: "OpenSkyNet", role: "role", priority: "primary" },
      internalProject: {
        key: "skynet",
        name: "Skynet",
        role: "role",
        mission: "mission",
        benchmarkPurpose: "purpose",
        successCriteria: [],
        priority: "secondary",
      },
      reporting: {
        separatePlatformFromInternalProject: true,
        maintenanceIsNotProjectProgress: true,
        internalProjectActsAsAgenticBenchmark: true,
        internalProjectFindingsMustTransferToKernel: true,
        internalProjectMustNotBeKernelDependency: true,
        avoidAnthropomorphicClaimsWithoutEvidence: true,
        authoritativeStateSources: [],
      },
    },
    identity: {
      continuityId: null,
      turnCount: 0,
      activeGoalTask: null,
      lastOutcomeStatus: null,
      failureStreak: 0,
    },
    authority: {
      worldModelStatus: "healthy",
      kernelStatus: "missing",
      degradedComponents: [],
      operationalMemoryStatus: "missing",
      operationalMemoryLatestAt: null,
    },
    omega: {
      timelineLength: 0,
      learnedConstraints: [],
      topProblemClasses: [],
      recoveryPreference: null,
      localityPreference: null,
    },
    agenticBenchmark: {
      projectKey: "skynet",
      projectName: "Skynet",
      continuityScore: null,
      hasRunnableExperiment: false,
      hasExplicitCommitment: false,
      hasRecommendedAction: false,
      benchmarkScore: 0,
    },
    internalProjectState: {
      name: "Skynet",
      focusKey: null,
      focusTitle: null,
      mode: null,
      continuityScore: null,
      topWorkItem: null,
      recommendedAction: null,
      commitment: null,
      experiment: null,
    },
    skynet: {
      name: "Skynet",
      focusKey: null,
      focusTitle: null,
      mode: null,
      continuityScore: null,
      topWorkItem: null,
      recommendedAction: null,
      commitment: null,
      experiment: null,
    },
  };
  return { ...base, ...overrides };
}

describe("living memory events", () => {
  let tmpDir = "";

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "living-memory-events-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("derives runtime_initialized when there is no prior state", () => {
    const next = buildState({
      updatedAt: 10,
      internalProjectState: {
        ...buildState().internalProjectState,
        focusKey: "endogenous_science_agenda",
        mode: "explore",
      },
    });
    const events = deriveOpenSkynetLivingMemoryEvents({
      sessionKey: next.sessionKey,
      prior: undefined,
      next,
    });
    expect(events).toEqual([
      expect.objectContaining({
        kind: "runtime_initialized",
        sessionKey: next.sessionKey,
      }),
    ]);
  });

  it("appends derived events to jsonl history", async () => {
    const prior = buildState({
      updatedAt: 10,
      internalProjectState: {
        ...buildState().internalProjectState,
        focusKey: "focus-a",
        mode: "explore",
        continuityScore: 0.2,
      },
      identity: { ...buildState().identity, activeGoalTask: "task-a" },
    });
    const next = buildState({
      updatedAt: 20,
      internalProjectState: {
        ...buildState().internalProjectState,
        focusKey: "focus-b",
        mode: "exploit",
        continuityScore: 0.5,
      },
      identity: { ...buildState().identity, activeGoalTask: "task-b" },
    });
    const events = deriveOpenSkynetLivingMemoryEvents({
      sessionKey: next.sessionKey,
      prior,
      next,
    });
    const historyPath = path.join(tmpDir, "history.jsonl");
    await appendOpenSkynetLivingMemoryEvents({ historyPath, events });
    const lines = (await fs.readFile(historyPath, "utf-8")).trim().split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(3);
  });
});
