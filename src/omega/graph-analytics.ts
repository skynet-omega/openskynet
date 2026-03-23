import { createSubsystemLogger } from "../logging/subsystem.js";
import {
  OMEGA_RICCI_BOTTLENECK_THRESHOLD,
  OMEGA_RICCI_NEGATIVE_CURVATURE_THRESHOLD,
} from "./policy.js";
import type { OmegaSelfTimeKernelState, OmegaKernelTrackedFile } from "./self-time-kernel.js";

const log = createSubsystemLogger("omega/graph-analytics");

export interface GraphNodeCurvature {
  path: string;
  curvature: number; // -1 to 1 (negative = bottleneck/failure point)
  entropy: number; // uncertainty level
  centrality: number; // how many goals/edges point to this
}

export class RicciGraphAnalytics {
  /**
   * Analyze causal-graph stress and rank likely bottlenecks first.
   */
  static analyze(kernel: OmegaSelfTimeKernelState): GraphNodeCurvature[] {
    const { files, edges } = kernel.causalGraph;
    const results: GraphNodeCurvature[] = [];

    for (const file of files) {
      // Centrality: how many causal edges touch this file.
      const connectedEdges = edges.filter((edge) => edge.filePath === file.path);
      const centrality = connectedEdges.length / Math.max(1, edges.length);

      // Simplified Ricci-style stress score for causal graphs.
      const successRatio = file.writeCount / Math.max(1, file.writeCount + file.failureCount);
      const failurePenalty = file.failureCount > 0 ? -(file.failureCount / 5) : 0;
      const curvature = Math.max(-1, Math.min(1, successRatio * 2 - 1 + failurePenalty));

      if (curvature < OMEGA_RICCI_NEGATIVE_CURVATURE_THRESHOLD) {
        log.debug("negative Ricci-style bottleneck detected", {
          path: file.path,
          curvature,
        });
      }

      // Local entropy: mismatch between attempted work and observed outcomes.
      const localEntropy = file.failureCount > 2 ? 0.8 : file.failureCount / 5;

      results.push({
        path: file.path,
        curvature,
        entropy: localEntropy,
        centrality,
      });
    }

    // Most-negative curvature first: likely bottlenecks first.
    return results.sort((a, b) => a.curvature - b.curvature);
  }

  /**
   * Generate a focus recommendation for the executive layer.
   */
  static getFocusRecommendation(kernel: OmegaSelfTimeKernelState): string | null {
    const analysis = this.analyze(kernel);
    const bottlenecks = analysis.filter(
      (node) => node.curvature < OMEGA_RICCI_BOTTLENECK_THRESHOLD,
    );

    if (bottlenecks.length > 0) {
      const top = bottlenecks[0];
      return `Critical Bottleneck: '${top.path}' has high failure tension (Ricci Curvature: ${top.curvature.toFixed(2)}). Focus on stabilizing this module.`;
    }

    return null;
  }
}
