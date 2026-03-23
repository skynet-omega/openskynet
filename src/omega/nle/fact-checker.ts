/**
 * fact-checker.ts
 * Validador de consistencia para la Capa NLE.
 * Utilidad: Detecta contradicciones lógicas entre el estado observado y las inferencias.
 */

import { LogicPredicate } from "./types.js";

export class NLEFactChecker {
  /**
   * Valida si un nuevo predicado contradice la base de conocimientos actual.
   * Criterio falsable: Si existe P y NO P con truthValue alto, hay una ruptura de coherencia.
   */
  public verify(
    newPredicate: LogicPredicate,
    existing: LogicPredicate[],
  ): { valid: boolean; conflict?: string } {
    // Ejemplo de regla de contradicción: system_idle vs system_busy
    if (newPredicate.id === "system_idle" && newPredicate.truthValue > 0.8) {
      const busy = existing.find((p) => p.id === "system_busy" && p.truthValue > 0.8);
      if (busy) {
        return {
          valid: false,
          conflict: "Contradiction: system cannot be idle and busy simultaneously.",
        };
      }
    }

    // Regla de viabilidad: si hay correction_needed pero no hay recursos (costStress muy alto)
    if (newPredicate.id === "correction_needed" && newPredicate.truthValue > 0.5) {
      const costStress = existing.find((p) => p.id === "high_cost_stress" && p.truthValue > 0.9);
      if (costStress) {
        return {
          valid: false,
          conflict: "Infeasible: correction needed but metabolic cost is too high.",
        };
      }
    }

    return { valid: true };
  }
}
