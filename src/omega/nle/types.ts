/**
 * types.ts
 * Definiciones base para la Capa de Razonamiento Lógico (NLE).
 */

export interface LogicPredicate {
  id: string;
  name: string;
  truthValue: number; // 0..1 (Lógica difusa)
  source: "observation" | "inference" | "axiom";
  timestamp: number;
}

export interface LogicRule {
  id: string;
  antecedents: string[]; // Predicate IDs
  consequent: string; // Predicate ID
  weight: number; // Fuerza de la regla
  utility: number; // Utilidad empírica demostrada
}

export interface InherentConstraint {
  id: string;
  predicateId: string;
  kind: "soft" | "hard";
  description: string;
}
