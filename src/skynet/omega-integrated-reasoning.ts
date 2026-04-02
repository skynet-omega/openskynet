/**
 * omega-integrated-reasoning.ts
 *
 * Orquestador de las 5 joyas de SKYNET_OMEGA
 * Coordina: NLE + HM + Lyapunov + Causal + Metabolism
 *
 * Interfaz unificada para heartbeat.ts
 */

import { getCausalReasoner } from "./causal-reasoner.js";
import { getHierarchicalMemory } from "./hierarchical-memory.js";
import { getLyapunovController } from "./lyapunov-controller.js";
import { getNeuralLogicEngine } from "./neural-logic-engine.js";
import { getSparseMetabolism } from "./sparse-metabolism.js";

export interface IntegratedReasoningState {
  timestamp: number;
  cycleNumber: number;
  frustration: number;

  // Componentes activos según metabolism
  metabolism: {
    totalMetabolicRate: number;
    activeComponents: string[];
  };

  // Neural Logic Engine
  nle?: {
    activeRules: number;
    confidence: number;
  };

  // Hierarchical Memory
  hm?: {
    workingMemorySize: number;
    episodicMatches: number;
    semanticConcepts: number;
  };

  // Lyapunov Control
  lyapunov?: {
    divergence: number;
    damping: number;
    isStable: boolean;
  };

  // Causal Reasoner
  causal?: {
    nodesInGraph: number;
    confoundersDetected: number;
    predictedBackfires: string[];
  };

  // Final decision
  finalDrive: {
    kind: string;
    urgency: number;
    dampedFromOriginal: boolean;
    confidence: number;
  };
}

export class OmegaIntegratedReasoner {
  private cycleCount = 0;

  /**
   * CORE: Ejecutar razonamiento integrado sobre una decisión
   *
   * Input:
   *   - driveSignal: la decisión propuesta (from evaluateInnerDrives + JEPA)
   *   - kernelState: estado actual del kernel
   *   - frustration: nivel de frustración (0-1)
   *
   * Output:
   *   - driveSignal mejorado con razonamiento de todas las joyas
   *   - estados internos para logging
   */
  async integratedReason(
    driveSignal: any,
    kernelState: any,
    jepaTension: number,
  ): Promise<{ enhancedDrive: any; state: IntegratedReasoningState }> {
    this.cycleCount++;
    const timestamp = Date.now();
    const frustration = jepaTension; // 0-1

    // ───────────────────────────────────────────────────────────────
    // FASE 0: SPARSE METABOLISM - Decide qué ejecutar
    // ───────────────────────────────────────────────────────────────
    const metabolism = getSparseMetabolism();
    const metabolismState = metabolism.computeMetabolism(frustration);

    const state: IntegratedReasoningState = {
      timestamp,
      cycleNumber: this.cycleCount,
      frustration,
      metabolism: {
        totalMetabolicRate: metabolismState.totalMetabolicRate,
        activeComponents: metabolismState.activatedComponents,
      },
      finalDrive: {
        kind: driveSignal.kind,
        urgency: driveSignal.urgency ?? 0,
        dampedFromOriginal: false,
        confidence: 0.5,
      },
    };

    let enhancedDrive = { ...driveSignal };
    // ───────────────────────────────────────────────────────────────
    // FASE 1: NEURAL LOGIC ENGINE
    // ───────────────────────────────────────────────────────────────
    if (metabolism.shouldActivate("neural_logic_engine")) {
      const nle = getNeuralLogicEngine();
      const currentState = [
        frustration,
        kernelState.successRate ?? 0.5,
        Math.min(1, (kernelState.failureCount ?? 0) / 100),
        driveSignal.urgency ?? 0,
      ];

      const logicInference = nle.infer(currentState, {
        frustration,
        recentFailures: kernelState.recentFailureCount ?? 0,
        successRate: kernelState.successRate ?? 0.5,
      });

      state.nle = {
        activeRules: logicInference.activeRules.length,
        confidence: logicInference.inferenceConfidence,
      };
    }

    // ───────────────────────────────────────────────────────────────
    // FASE 2: HIERARCHICAL MEMORY
    // ───────────────────────────────────────────────────────────────
    if (metabolism.shouldActivate("hierarchical_memory")) {
      const hm = getHierarchicalMemory();

      // Agregar a working memory
      hm.addToWorking({
        content: {
          driveKind: driveSignal.kind,
          frustration,
          successRate: kernelState.successRate ?? 0.5,
          action: driveSignal.kind,
        },
      });

      // Agregar episodio
      hm.addEpisode(
        [
          frustration,
          kernelState.successRate ?? 0.5,
          Math.min(1, (kernelState.failureCount ?? 0) / 100),
          driveSignal.urgency ?? 0,
        ],
        frustration,
        driveSignal.kind,
        (kernelState.successRate ?? 0.5 > 0.6) ? "success" : "neutral",
        this.cycleCount,
        { reward: driveSignal.urgency ?? 0.5 },
      );

      const memStats = hm.getStats();
      state.hm = {
        workingMemorySize: memStats.working,
        episodicMatches: memStats.episodic,
        semanticConcepts: memStats.semantic,
      };
    }

    // ───────────────────────────────────────────────────────────────
    // FASE 3: LYAPUNOV CONTROL
    // ───────────────────────────────────────────────────────────────
    let originalUrgency = enhancedDrive.urgency ?? 1.0;
    if (metabolism.shouldActivate("lyapunov_controller")) {
      const lyapunov = getLyapunovController();

      // Calcular divergencia
      const divergence = lyapunov.computeDivergence(
        [frustration, kernelState.successRate ?? 0.5],
        [kernelState.lastFrustration ?? 0, kernelState.lastSuccessRate ?? 0.5],
        kernelState.predictionError ?? 0.1,
        0.1 * frustration,
      );

      const damping = lyapunov.computeDamping(divergence);
      const dampedUrgency = lyapunov.applyDampingToGain(originalUrgency, damping);

      state.lyapunov = {
        divergence,
        damping,
        isStable: divergence <= 0.15,
      };

      enhancedDrive.urgency = dampedUrgency;
      state.finalDrive.dampedFromOriginal = Math.abs(dampedUrgency - originalUrgency) > 0.01;
    }

    // ───────────────────────────────────────────────────────────────
    // FASE 4: CAUSAL REASONER
    // ───────────────────────────────────────────────────────────────
    if (metabolism.shouldActivate("causal_reasoner") && driveSignal.kind !== "idle") {
      const reasoner = getCausalReasoner();

      // Observar correlación
      reasoner.observeCorrelation(
        `action_${driveSignal.kind}`,
        (kernelState.successRate ?? 0.5 > 0.6) ? "success" : "failure",
        "A→B",
      );

      // Razonar sobre la acción
      const intervention = reasoner.reasonAboutIntervention(driveSignal.kind);

      const reasonerStats = reasoner.getStats();
      state.causal = {
        nodesInGraph: reasonerStats.nodes,
        confoundersDetected: reasonerStats.confounders,
        predictedBackfires: intervention.potentialBackfires,
      };
    }

    // ───────────────────────────────────────────────────────────────
    // FINAL: Calcular confianza combinada
    // ───────────────────────────────────────────────────────────────
    const nleWeight = state.nle ? state.nle.confidence * 0.3 : 0;
    const hmWeight = state.hm ? 0.2 : 0; // HM siempre contribuye 20%
    const lyapunovWeight = state.lyapunov ? (state.lyapunov.isStable ? 0.3 : 0.2) : 0;
    const causalWeight = state.causal ? 0.2 : 0;

    const totalWeight = nleWeight + hmWeight + lyapunovWeight + causalWeight;
    state.finalDrive.confidence = totalWeight > 0 ? totalWeight / 1.0 : 0.5;

    return {
      enhancedDrive,
      state,
    };
  }

  /**
   * Generar reporte diagnóstico (para logging verbose)
   */
  generateDiagnosticReport(state: IntegratedReasoningState): string {
    let report = `\n[INTEGRATED REASONING - Cycle ${state.cycleNumber}]\n`;
    report += `  Frustration: ${(state.frustration * 100).toFixed(1)}%\n`;
    report += `  Metabolic Rate: ${(state.metabolism.totalMetabolicRate * 100).toFixed(1)}%\n`;
    report += `  Active Components: ${state.metabolism.activeComponents.join(", ") || "NONE"}\n`;

    if (state.nle) {
      report += `\n  [NLE] ${state.nle.activeRules} rules active, confidence ${(state.nle.confidence * 100).toFixed(0)}%\n`;
    }

    if (state.hm) {
      report += `  [HM] Working=${state.hm.workingMemorySize}, Episodic=${state.hm.episodicMatches}, Semantic=${state.hm.semanticConcepts}\n`;
    }

    if (state.lyapunov) {
      report += `  [Lyapunov] Divergence=${state.lyapunov.divergence.toFixed(3)}, Damping=${(state.lyapunov.damping * 100).toFixed(1)}%, ${state.lyapunov.isStable ? "🟢 STABLE" : "🔴 AT RISK"}\n`;
    }

    if (state.causal) {
      report += `  [Causal] DAG nodes=${state.causal.nodesInGraph}, confounders=${state.causal.confoundersDetected}\n`;
      if (state.causal.predictedBackfires.length > 0) {
        report += `    ⚠ Predicted backfires: ${state.causal.predictedBackfires.join(", ")}\n`;
      }
    }

    report += `\n  Final Drive: ${state.finalDrive.kind}@${state.finalDrive.urgency.toFixed(2)} (confidence ${(state.finalDrive.confidence * 100).toFixed(0)}%)\n`;
    if (state.finalDrive.dampedFromOriginal) {
      report += `    ↓ Dampened by Lyapunov control\n`;
    }

    return report;
  }

  /**
   * Get last state para logging
   */
  getLastState(): IntegratedReasoningState | null {
    // Esto se puede mejorar con storage de estado
    return null;
  }
}

/**
 * Singleton
 */
let reasonerInstance: OmegaIntegratedReasoner | null = null;

export function getOmegaIntegratedReasoner(): OmegaIntegratedReasoner {
  if (!reasonerInstance) {
    reasonerInstance = new OmegaIntegratedReasoner();
  }
  return reasonerInstance;
}

export function initializeOmegaIntegratedReasoner(): OmegaIntegratedReasoner {
  reasonerInstance = new OmegaIntegratedReasoner();
  console.log("[OmegaIntegratedReasoner] All 5 jewels initialized and ready");
  return reasonerInstance;
}
