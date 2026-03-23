import * as omegaIntegratedReasoner from "./experimental/omega-integrated-reasoning.js";
// EXPERIMENTAL: To be decoupled
const { getOmegaIntegratedReasoner } = omegaIntegratedReasoner;
import type { IntegratedReasoningState } from "./experimental/omega-integrated-reasoning.js";
import type { InnerDriveSignal } from "./inner-life/drives.js";
import type { OmegaOperationalMemorySummary } from "./operational-memory.js";
import type { OmegaSelfTimeKernelState } from "./self-time-kernel.js";

/**
 * Procesa el razonamiento integrado de Omega unificando las 5 joyas cognitivas.
 */
export async function processIntegratedBrain(params: {
  workspaceRoot: string;
  kernel: OmegaSelfTimeKernelState;
  operationalSummary?: OmegaOperationalMemorySummary;
  driveSignal: InnerDriveSignal;
  jepaTension: number;
  expectedUtility?: number;
  somaticMetrics?: {
    lastTurnLatencyMs: number;
    cumulativeTokenCost?: number;
  };
}) {
  const reasoner = getOmegaIntegratedReasoner();

  const latestCausalImpact = params.operationalSummary?.latestCausalImpact ?? 1.0;
  const expectedUtility = params.expectedUtility ?? 0.5;
  const surprise = Math.abs(expectedUtility - latestCausalImpact);

  // Normalización somática: Latencia > 30s se considera "estrés metabólico"
  const latencyStress = Math.min((params.somaticMetrics?.lastTurnLatencyMs ?? 0) / 30000, 1);

  // Economía de Recursos: Presión de tokens (Stress económico)
  // Se asume 1M tokens como umbral de alerta (configurable)
  const costStress = Math.min((params.somaticMetrics?.cumulativeTokenCost ?? 0) / 1000000, 1);

  const kernelGoals = params.kernel?.goals || [];
  const successRate =
    kernelGoals.length > 0
      ? kernelGoals.filter((g) => g && g.status === "completed").length / kernelGoals.length
      : 0.5;

  const kernelState = {
    successRate,
    failureCount: params.kernel?.tension?.failureStreak ?? 0,
    recentFailureCount: params.kernel?.tension?.failureStreak ?? 0,
    lastFrustration: params.operationalSummary?.averageCausalImpact
      ? 1 - params.operationalSummary.averageCausalImpact
      : 0.5,
    predictionError: surprise,
    somaticStress: latencyStress,
    averageCausalImpact: params.operationalSummary?.averageCausalImpact ?? 1.0,
    costStress,
  };

  const result = await reasoner.integratedReason(
    params.driveSignal,
    kernelState,
    params.jepaTension,
    params.workspaceRoot,
  );
  result.state.somaticStress = latencyStress;
  return result;
}

/**
 * Formatea la reflexión interna del cerebro para el prompt del agente.
 * Esto le da al agente un "yo interno" y conciencia de su estado cognitivo.
 */
export function formatInternalReflection(state: IntegratedReasoningState): string[] {
  const lines = ["[INTERNAL REFLECTION — Self-Awareness]"];

  const stability = state.lyapunov?.isStable ? "STABLE (Focused)" : "DIVERGENT (Seeking path)";
  lines.push(`Cognitive State: ${stability}`);
  lines.push(`Frustration Level: ${(state.frustration * 100).toFixed(1)}%`);

  const metabolism = `Active: ${state.metabolism.activeComponents.join(", ") || "Minimal"}`;
  lines.push(
    `Resource Allocation: ${metabolism} (Rate: ${state.metabolism.totalMetabolicRate.toFixed(2)})`,
  );

  if (typeof state.somaticStress === "number" && state.somaticStress > 0.7) {
    lines.push(
      `Somatic Signal: HIGH METABOLIC STRESS (System response latency affecting coherence)`,
    );
  }

  if (state.causal && state.causal.predictedBackfires.length > 0) {
    lines.push(
      `Causal Projection: WARNING - Potential backfires in current strategy: ${state.causal.predictedBackfires.join(", ")}`,
    );
  }

  if (state.projection) {
    const proj = state.projection;
    lines.push(
      `Imaginative Projection: Expected outcome is ${proj.expectedOutcome.toUpperCase()} (Confidence: ${(proj.confidence * 100).toFixed(0)}%)`,
    );
    if (proj.potentialSideEffects.length > 0) {
      lines.push(`Side Effects Rehearsal: ${proj.potentialSideEffects.join(", ")}`);
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
