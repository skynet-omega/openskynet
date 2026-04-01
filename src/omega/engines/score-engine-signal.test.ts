import { describe, expect, it } from "vitest";
import {
  mergeOmegaDriveSignalWithEngineScore,
  scoreOmegaEngineSignals,
} from "./score-engine-signal.js";
import type { OmegaEngineSignal } from "./types.js";

describe("omega engine signal scoring", () => {
  it("promotes strong contradiction clusters into a homeostasis drive", () => {
    const score = scoreOmegaEngineSignals([
      {
        source: "entropy-minimization",
        kind: "contradiction",
        severity: 0.5,
        summary: "stale goals contradict claimed completion",
        contradictionKind: "goal_conflict",
      },
    ] satisfies OmegaEngineSignal[]);

    expect(score.dominantCategory).toBe("homeostasis");
    expect(score.dominantScore).toBeGreaterThan(0.45);
    expect(score.recommendedDrive).toMatchObject({
      kind: "homeostasis",
    });
  });

  it("keeps low-grade speculative thoughts below activation threshold", () => {
    const score = scoreOmegaEngineSignals([
      {
        source: "continuous-thinking",
        kind: "thought",
        severity: 0.3,
        summary: "what single question would reduce uncertainty most?",
        thoughtId: "thought_1",
        drive: "adaptive_depth",
      },
    ] satisfies OmegaEngineSignal[]);

    expect(score.dominantCategory).toBe("curiosity");
    expect(score.dominantScore).toBeLessThan(0.45);
    expect(score.recommendedDrive).toEqual({ kind: "idle" });
  });

  it("uses engine guidance when the base drive is idle", () => {
    const engineScore = scoreOmegaEngineSignals([
      {
        source: "jepa-empirical",
        kind: "correlation",
        severity: 0.5,
        summary: "jepa_correlation=0.5 events=12",
        correlationScore: 0.5,
        totalEvents: 12,
      },
    ] satisfies OmegaEngineSignal[]);

    const merged = mergeOmegaDriveSignalWithEngineScore({
      baseDriveSignal: { kind: "idle" },
      engineScore,
    });

    expect(merged).toMatchObject({
      kind: "entropy_alert",
      silentMs: 0,
    });
  });

  it("does not activate a fresh drive from hypothesis bookkeeping alone", () => {
    const score = scoreOmegaEngineSignals([
      {
        source: "active-learning",
        kind: "hypothesis_tested",
        severity: 1,
        summary: "jepa_correlation:0.40, events:8",
        hypothesisId: "hyp_1",
        confirmed: true,
      },
    ] satisfies OmegaEngineSignal[]);

    expect(score.dominantCategory).toBe("curiosity");
    expect(score.recommendedDrive).toEqual({ kind: "idle" });
  });

  it("preserves the base drive kind while boosting urgency when engine evidence agrees", () => {
    const engineScore = scoreOmegaEngineSignals([
      {
        source: "continuous-thinking",
        kind: "thought",
        severity: 0.6,
        summary: "a memory gap should be explored",
        thoughtId: "thought_2",
        drive: "learning",
      },
    ] satisfies OmegaEngineSignal[]);

    const merged = mergeOmegaDriveSignalWithEngineScore({
      baseDriveSignal: {
        kind: "curiosity",
        target: "memory/2026-03-25.md",
        reason: "base_curiosity",
        urgency: 0.4,
      },
      engineScore,
    });

    expect(merged).toMatchObject({
      kind: "curiosity",
    });
    expect(merged.kind === "curiosity" ? merged.urgency : 0).toBeGreaterThan(0.4);
  });
});
