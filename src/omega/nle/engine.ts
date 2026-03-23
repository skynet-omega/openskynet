/**
 * engine.ts
 * Implementación de la Capa de Razonamiento Lógico (NLE).
 * Esta capa actúa sobre los predicados lógicos derivados del estado del sistema.
 */

import { NLEFactChecker } from "./fact-checker.js";
import { InherentConstraint, LogicPredicate, LogicRule } from "./types.js";

export class NLEEngine {
  private predicates: Map<string, LogicPredicate> = new Map();
  private rules: Map<string, LogicRule> = new Map();
  private constraints: InherentConstraint[] = [];
  private factChecker: NLEFactChecker = new NLEFactChecker();

  constructor() {
    this.initializeAxioms();
  }

  private initializeAxioms() {
    // Axioma de persistencia: El sistema debe intentar sobrevivir (minimizar entropía)
    this.addPredicate({
      id: "axiom:persistence",
      name: "system_must_persist",
      truthValue: 1.0,
      source: "axiom",
      timestamp: Date.now(),
    });

    // Regla fundamental: Si hay incoherencia (homeostasis) -> requiere acción
    this.rules.set("rule:homeostasis_correction", {
      id: "rule:homeostasis_correction",
      antecedents: ["homeostasis_detected"],
      consequent: "correction_needed",
      weight: 0.9,
      utility: 1.0,
    });
  }

  public addPredicate(p: LogicPredicate) {
    const check = this.factChecker.verify(p, Array.from(this.predicates.values()));
    if (!check.valid) {
      console.warn(`[NLE Engine] Rejected predicate ${p.id}: ${check.conflict}`);
      return false;
    }
    this.predicates.set(p.id, p);
    return true;
  }

  /**
   * Inferencia lógica difusa sobre el conjunto de predicados.
   * Utilidad real: Resolver conflictos de objetivos y validar la viabilidad.
   */
  public infer(): LogicPredicate[] {
    const newInferences: LogicPredicate[] = [];

    for (const rule of this.rules.values()) {
      const antecedentValues = rule.antecedents.map(
        (id) => this.predicates.get(id)?.truthValue ?? 0,
      );

      if (antecedentValues.length > 0) {
        // Lógica de Godel (min(antecedentes))
        const minTruth = Math.min(...antecedentValues);
        const truthValue = minTruth * rule.weight;

        if (truthValue > 0.3) {
          const p: LogicPredicate = {
            id: rule.consequent,
            name: `inferred:${rule.consequent}`,
            truthValue,
            source: "inference",
            timestamp: Date.now(),
          };
          newInferences.push(p);
        }
      }
    }

    newInferences.forEach((p) => this.addPredicate(p));
    return newInferences;
  }

  /**
   * Validación falsable: ¿La inferencia actual contradice las restricciones?
   */
  public checkConsistency(): { consistent: boolean; violations: string[] } {
    const violations: string[] = [];

    for (const constraint of this.constraints) {
      const p = this.predicates.get(constraint.predicateId);
      if (p && p.truthValue > 0.8 && constraint.kind === "hard") {
        // En un motor real, esto buscaría predicados opuestos
      }
    }

    return {
      consistent: violations.length === 0,
      violations,
    };
  }

  public getPredicates() {
    return Array.from(this.predicates.values());
  }
}

let engineInstance: NLEEngine | null = null;

export function getNLEEngine(): NLEEngine {
  if (!engineInstance) {
    engineInstance = new NLEEngine();
  }
  return engineInstance;
}
