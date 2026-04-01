import fs from "node:fs/promises";
import path from "node:path";
import {
  OMEGA_METABOLISM_ACTIVATION_THRESHOLD,
  OMEGA_METABOLISM_FRUSTRATION_MULTIPLIER,
} from "./policy.js";
import type { ComponentType } from "./sparse-metabolism.js";

export type AdaptiveWeights = {
  activationThresholds: Record<ComponentType, number>;
  frustrationMultipliers: Record<ComponentType, number>;
};

export class AdaptivePolicyEngine {
  private weightsPath: string;
  private currentWeights: AdaptiveWeights;

  constructor(workspaceRoot: string) {
    this.weightsPath = path.join(workspaceRoot, ".openskynet", "adaptive-weights.json");
    this.currentWeights = {
      activationThresholds: { ...OMEGA_METABOLISM_ACTIVATION_THRESHOLD },
      frustrationMultipliers: { ...OMEGA_METABOLISM_FRUSTRATION_MULTIPLIER },
    };
  }

  async load(): Promise<AdaptiveWeights> {
    try {
      const raw = await fs.readFile(this.weightsPath, "utf-8");
      const saved = JSON.parse(raw) as Partial<AdaptiveWeights>;

      if (saved.activationThresholds) {
        this.currentWeights.activationThresholds = {
          ...this.currentWeights.activationThresholds,
          ...saved.activationThresholds,
        };
      }
      if (saved.frustrationMultipliers) {
        this.currentWeights.frustrationMultipliers = {
          ...this.currentWeights.frustrationMultipliers,
          ...saved.frustrationMultipliers,
        };
      }
    } catch {
      // Fallback to base policy
    }
    return this.currentWeights;
  }

  async save(): Promise<void> {
    await fs.mkdir(path.dirname(this.weightsPath), { recursive: true }).catch(() => {});
    await fs.writeFile(this.weightsPath, JSON.stringify(this.currentWeights, null, 2), "utf-8");
  }

  /**
   * Ajusta un hiperparámetro en base a evidencia empírica (Falsabilidad).
   * Ej: Si hay un fallo estructural recurrente, bajar el threshold del NLE para forzar más rigor lógico.
   */
  async applyEmpiricalPenalty(lawId: string): Promise<void> {
    await this.load();

    let mutated = false;
    if (lawId === "L-001") {
      // Latencia alta: Aumentar el threshold del NLE y Causal para que no se activen tan fácil
      this.currentWeights.activationThresholds.neural_logic_engine = Math.min(
        1.0,
        this.currentWeights.activationThresholds.neural_logic_engine + 0.1,
      );
      this.currentWeights.activationThresholds.causal_reasoner = Math.min(
        1.0,
        this.currentWeights.activationThresholds.causal_reasoner + 0.1,
      );
      mutated = true;
    } else if (lawId === "L-002") {
      // Fallo repetido (Límite Causal): Bajar threshold del NLE para forzar razonamiento profundo antes de actuar
      this.currentWeights.activationThresholds.neural_logic_engine = Math.max(
        0.0,
        this.currentWeights.activationThresholds.neural_logic_engine - 0.15,
      );
      this.currentWeights.frustrationMultipliers.neural_logic_engine = Math.min(
        3.0,
        this.currentWeights.frustrationMultipliers.neural_logic_engine + 0.2,
      );
      mutated = true;
    } else if (lawId === "SYNTAX_CORRUPTION") {
      // Corrupción de código: NLE obligatorio (threshold 0)
      this.currentWeights.activationThresholds.neural_logic_engine = 0.0;
      mutated = true;
    }

    if (mutated) {
      await this.save();
    }
  }

  getWeights(): AdaptiveWeights {
    return this.currentWeights;
  }
}
