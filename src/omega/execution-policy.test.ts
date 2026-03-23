import { describe, expect, it } from "vitest";
import {
  buildOmegaRecoveryStrategyKey,
  chooseOmegaRecoveryRoute,
  decideOmegaWorkPolicyRoute,
  deriveOmegaEmpiricalRoutingPreference,
  deriveOmegaExecutiveRoutingDirective,
} from "./execution-policy.js";

describe("omega execution policy", () => {
  it("prefers strong generalized empirical routing for validated single-target work", () => {
    const preference = deriveOmegaEmpiricalRoutingPreference({
      requiresValidation: true,
      expectedPathCount: 1,
      watchedPathCount: 1,
      snapshot: {
        sessionKey: "main",
        problemAgenda: [],
        timelineLength: 0,
        relevantMemories: [],
        operationalSignals: [],
        generalizedRecoveryPreference: {
          preferredRoute: "sessions_spawn",
          confidence: 0.8,
          delegateSuccesses: 1,
          isolatedSuccesses: 4,
          mechanismKey: "target_not_touched|single_target",
        },
      },
    });

    expect(preference).toMatchObject({
      route: "sessions_spawn",
      source: "generalized",
    });
  });

  it("prefers locality-derived isolation bias for validated single-target work", () => {
    const preference = deriveOmegaEmpiricalRoutingPreference({
      requiresValidation: true,
      expectedPathCount: 1,
      watchedPathCount: 1,
      snapshot: {
        sessionKey: "main",
        problemAgenda: [],
        timelineLength: 0,
        relevantMemories: [],
        operationalSignals: [],
        localityRoutingPreference: {
          preferredRoute: "sessions_spawn",
          confidence: 0.85,
          lowLocalityFailures: 3,
          highLocalitySuccesses: 0,
        },
      },
    });

    expect(preference).toMatchObject({
      route: "sessions_spawn",
      source: "locality",
    });
  });

  it("lets a locality guard preempt local execution when protected paths are at risk", () => {
    const preference = deriveOmegaEmpiricalRoutingPreference({
      requiresValidation: true,
      expectedPathCount: 1,
      watchedPathCount: 2,
      snapshot: {
        sessionKey: "main",
        problemAgenda: [],
        timelineLength: 0,
        relevantMemories: [],
        operationalSignals: [],
        localityExecutionGuard: {
          shouldIsolate: true,
          confidence: 0.9,
          evidenceCount: 3,
          atRiskPaths: ["src/unrelated.ts"],
          reasons: ["unexpected_collateral_writes"],
        },
      },
    });

    expect(preference).toMatchObject({
      route: "sessions_spawn",
      source: "locality_guard",
    });
  });

  it("lets the executive override validated routing when recovery is selected", () => {
    const directive = deriveOmegaExecutiveRoutingDirective({
      requiresValidation: true,
      expectedPathCount: 1,
      matchedRecoverySuggestedRoute: "omega_delegate",
      preferredValidatedRoute: {
        route: "sessions_spawn",
        confidence: 0.9,
        source: "generalized",
      },
      dispatchPlan: {
        shouldDispatchLlmTurn: true,
        selectedAction: "recover",
        queueKind: "anomaly",
        expectedUtility: 0.8,
        utilityBreakdown: {
          urgency: 0.7,
          expectedUtility: 0.8,
          uncertaintyReduction: 0.4,
          estimatedCost: 0.2,
          failureRisk: 0.1,
          budgetPressure: 0.2,
          finalScore: 0.6,
        },
        budgetUsage: {
          observedTurns: 1,
          observedLlmCalls: 1,
          observedWallTimeMs: 500,
          turnPressure: 0.1,
          llmPressure: 0.1,
          wallTimePressure: 0.1,
          budgetPressure: 0.1,
        },
        estimatedDispatchCostMs: 500,
        queueDepths: { goals: 1, anomalies: 1, maintenance: 0 },
        scheduledItems: [],
        nextWakeDelayMs: 1_000,
        rationale: ["recover"],
      },
    });

    expect(directive).toMatchObject({
      route: "sessions_spawn",
      reason: "executive_recover_isolated_bias",
      selectedAction: "recover",
      queueKind: "anomaly",
    });
  });

  it("chooses local validated routing by default before escalation", () => {
    expect(
      decideOmegaWorkPolicyRoute({
        isolated: false,
        requiresValidation: true,
        expectedPathCount: 1,
      }),
    ).toBe("omega_delegate");
  });

  it("uses isolated recovery after recent stalls when the shape was already isolation-biased", () => {
    const decision = chooseOmegaRecoveryRoute({
      recovery: {
        goalId: "goal-1",
        goalTask: "patch module",
        remainingTargets: ["src/a.ts"],
        collateralPaths: [],
        expectsJson: false,
        requiredKeys: [],
        failureStreak: 1,
        reason: "verified_write_failure_after_restart",
        suggestedRoute: "omega_delegate",
        resumeTask: "resume",
        lastErrorKind: "target_not_touched",
      },
      recentStalledTurns: 1,
      delegateStats: { attempts: 1, successes: 0, failures: 1 },
      isolatedStats: { attempts: 2, successes: 2, failures: 0 },
    });

    expect(decision).toEqual({
      route: "sessions_spawn",
      reason: "empirical_isolation_bias",
    });
  });

  it("builds stable strategy keys for shared policy consumers", () => {
    expect(
      buildOmegaRecoveryStrategyKey({
        recovery: {
          goalId: "goal-1",
          goalTask: "patch module",
          remainingTargets: ["src/a.ts"],
          collateralPaths: ["src/b.ts"],
          expectsJson: false,
          requiredKeys: [],
          failureStreak: 1,
          reason: "verified_locality_failure_after_restart",
          suggestedRoute: "sessions_spawn",
          resumeTask: "resume",
          lastErrorKind: "unexpected_collateral_writes",
        },
        route: "sessions_spawn",
      }),
    ).toBe("unexpected_collateral_writes|single_target|collateral|sessions_spawn");
  });
});
