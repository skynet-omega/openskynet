import type { OmegaOperationalTurnMemoryEntry } from "./operational-memory.js";

export type OmegaUtilityBreakdown = {
  taskProgressGain: number;
  uncertaintyReduction: number;
  futureFailureRiskReduction: number;
  tokenCost: number;
  wallTimeCost: number;
  disruptionCost: number;
  total: number;
  expectedUtility?: number;
};

export type OmegaBudgetUsage = {
  observedTurns: number;
  estimatedLlmCalls: number;
  observedWallTimeMs: number;
  budgetPressure: number;
  turnPressure?: number;
};

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function deriveOmegaBudgetUsage(params: {
  operationalSignals: OmegaOperationalTurnMemoryEntry[];
  maxTurnsPerCycle: number;
  maxLlmCalls: number;
  maxWallTimeMs: number;
}): OmegaBudgetUsage {
  const recentSignals = params.operationalSignals.slice(-3);
  const observedTurns = recentSignals.length;
  const estimatedLlmCalls = recentSignals.length;
  const observedWallTimeMs = recentSignals.reduce(
    (total, entry) => total + entry.latencyBreakdown.totalMs,
    0,
  );
  const turnPressure = params.maxTurnsPerCycle > 0 ? observedTurns / params.maxTurnsPerCycle : 1;
  const llmPressure = params.maxLlmCalls > 0 ? estimatedLlmCalls / params.maxLlmCalls : 1;
  const wallTimePressure = params.maxWallTimeMs > 0 ? observedWallTimeMs / params.maxWallTimeMs : 1;
  return {
    observedTurns,
    estimatedLlmCalls,
    observedWallTimeMs,
    budgetPressure: clampUnit(Math.max(turnPressure, llmPressure, wallTimePressure)),
    turnPressure,
  };
}

export function computeOmegaUtilityBreakdown(params: {
  urgency: number;
  expectedUtility: number;
  uncertaintyReduction: number;
  estimatedCost: number;
  failureRisk: number;
  budgetPressure?: number;
}): OmegaUtilityBreakdown {
  const taskProgressGain = clampUnit(params.urgency) * 0.35;
  const uncertaintyReduction = clampUnit(params.uncertaintyReduction) * 0.2;
  const futureFailureRiskReduction = clampUnit(params.expectedUtility) * 0.3;
  const tokenCost = clampUnit(params.estimatedCost) * 0.08;
  const wallTimeCost = clampUnit(params.estimatedCost) * 0.05;
  const disruptionCost =
    clampUnit(params.failureRisk) * 0.08 + clampUnit(params.budgetPressure ?? 0) * 0.06;
  return {
    taskProgressGain,
    uncertaintyReduction,
    futureFailureRiskReduction,
    tokenCost,
    wallTimeCost,
    disruptionCost,
    total:
      taskProgressGain +
      uncertaintyReduction +
      futureFailureRiskReduction -
      tokenCost -
      wallTimeCost -
      disruptionCost,
    expectedUtility: params.expectedUtility,
  };
}
