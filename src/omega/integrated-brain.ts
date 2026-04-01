type IntegratedBrainParams = {
  workspaceRoot: string;
  kernel: unknown;
  operationalSummary?: unknown;
  driveSignal: unknown;
  jepaTension: number;
  expectedUtility?: number;
  somaticMetrics?: {
    lastTurnLatencyMs: number;
    cumulativeTokenCost?: number;
  };
};

type IntegratedReasoningStateLike = {
  frustration: number;
  metabolism: {
    activeComponents: string[];
    totalMetabolicRate: number;
  };
  lyapunov?: {
    isStable?: boolean;
  };
  causal?: {
    predictedBackfires: string[];
  };
  nle?: {
    confidence: number;
    activeRules: number;
  };
  finalDrive: {
    confidence: number;
    vetoProb?: number;
  };
  somaticStress?: number;
  projection?: {
    expectedOutcome: string;
    confidence: number;
    potentialSideEffects: string[];
  };
};

type IntegratedBrainModule = {
  processIntegratedBrain?: (params: IntegratedBrainParams) => Promise<unknown>;
  formatInternalReflection?: (state: IntegratedReasoningStateLike) => string[];
};

async function loadOptionalIntegratedBrain(): Promise<IntegratedBrainModule | undefined> {
  try {
    return (await import("../skynet/integrated-brain.js")) as IntegratedBrainModule;
  } catch {
    return undefined;
  }
}

export async function processIntegratedBrain(params: IntegratedBrainParams): Promise<unknown> {
  const mod = await loadOptionalIntegratedBrain();
  if (typeof mod?.processIntegratedBrain !== "function") {
    return undefined;
  }
  return mod.processIntegratedBrain(params);
}

export function formatInternalReflection(state: IntegratedReasoningStateLike): string[] {
  const lines = ["[INTERNAL REFLECTION — Self-Awareness]"];

  const stability = state.lyapunov?.isStable ? "STABLE (Focused)" : "DIVERGENT (Seeking path)";
  lines.push(`Cognitive State: ${stability}`);
  lines.push(`Frustration Level: ${(state.frustration * 100).toFixed(1)}%`);
  lines.push(
    `Resource Allocation: ${state.metabolism.activeComponents.join(", ") || "Minimal"} (Rate: ${state.metabolism.totalMetabolicRate.toFixed(2)})`,
  );

  if (typeof state.somaticStress === "number" && state.somaticStress > 0.7) {
    lines.push(
      "Somatic Signal: HIGH METABOLIC STRESS (System response latency affecting coherence)",
    );
  }

  if (state.causal?.predictedBackfires?.length) {
    lines.push(
      `Causal Projection: WARNING - Potential backfires in current strategy: ${state.causal.predictedBackfires.join(", ")}`,
    );
  }

  if (state.projection) {
    lines.push(
      `Imaginative Projection: Expected outcome is ${state.projection.expectedOutcome.toUpperCase()} (Confidence: ${(state.projection.confidence * 100).toFixed(0)}%)`,
    );
    if (state.projection.potentialSideEffects.length > 0) {
      lines.push(`Side Effects Rehearsal: ${state.projection.potentialSideEffects.join(", ")}`);
    }
  }

  if (state.nle) {
    lines.push(
      `Reasoning Confidence: ${(state.nle.confidence * 100).toFixed(0)}% (${state.nle.activeRules} rules invoked)`,
    );
  }

  if (typeof state.finalDrive.vetoProb === "number") {
    const prob = (state.finalDrive.vetoProb * 100).toFixed(1);
    const signal = state.finalDrive.vetoProb < 0.5 ? "🔴 VETO RISK" : "🟢 VIABLE";
    lines.push(`Operational Viability: ${prob}% — ${signal}`);
  }

  lines.push(`Executive Confidence: ${(state.finalDrive.confidence * 100).toFixed(0)}%`);

  return lines;
}
