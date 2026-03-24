/**
 * src/omega/learned-rules/index.ts
 * ==================================
 * Sandbox de reglas aprendidas dinámicamente.
 *
 * Cuando active-learning-strategy.ts confirma una hipótesis,
 * el sistema puede generar una "regla de enrutamiento aprendida"
 * que se aplica en tiempo de ejecución sin reiniciar el proceso.
 *
 * Ataca directamente el Muro 1 (Abstracción Mecanística):
 * el sistema observa patrones de fallo → genera código de corrección
 * → lo aplica en operaciones futuras sin intervención humana.
 *
 * Principio de seguridad: las reglas SOLO pueden modificar el
 * enrutamiento de tareas (kind/route), NUNCA el filesystem directamente.
 * Esto evita que auto-modificación incompetente rompa el sistema.
 */

export type LearnedRouteKind =
  | "omega_delegate"
  | "sessions_spawn"
  | "sessions_send"
  | "frontal_cache";

export interface LearnedRoutingRule {
  /** ID único de la regla */
  id: string;
  /** Hipótesis que la generó */
  sourceHypothesis: string;
  /** Cuándo se aplicó por primera vez */
  learnedAt: number;
  /** Cuántas veces se ha aplicado */
  applicationCount: number;
  /** Cuántas veces tuvo éxito */
  successCount: number;
  /** Tasa de éxito observada (0-1) */
  get successRate(): number;
  /** La función de decisión real */
  apply: (context: LearnedRuleContext) => LearnedRouteKind | null;
}

export interface LearnedRuleContext {
  /** Descripción de la tarea actual */
  task: string;
  /** Ruta candidata actual */
  proposedRoute: LearnedRouteKind;
  /** Failure streak del kernel */
  failureStreak: number;
  /** Error kind del último fallo */
  lastErrorKind?: string;
  /** Archivos objetivo */
  targets: string[];
}

// ── Counters separados para mutabilidad segura ────────────────────────────────
// Separar el estado mutable de la interfaz pública evita no-const-assign
// y es más fácil de serializar en v2.
type RuleCounters = { applications: number; successes: number };
const _counters: Map<string, RuleCounters> = new Map();
const _registry: Map<string, LearnedRoutingRule> = new Map();

/**
 * Registra una nueva regla de enrutamiento aprendida.
 * Si ya existe una regla con el mismo ID, la actualiza.
 */
export function registerLearnedRule(
  rule: Omit<LearnedRoutingRule, "applicationCount" | "successCount" | "successRate">,
): void {
  if (_registry.has(rule.id)) {
    const existing = _registry.get(rule.id)!;
    existing.sourceHypothesis = rule.sourceHypothesis;
    existing.learnedAt = rule.learnedAt;
    return;
  }

  _counters.set(rule.id, { applications: 0, successes: 0 });

  _registry.set(rule.id, {
    ...rule,
    get applicationCount() {
      return _counters.get(rule.id)?.applications ?? 0;
    },
    get successCount() {
      return _counters.get(rule.id)?.successes ?? 0;
    },
    get successRate() {
      const c = _counters.get(rule.id);
      return c && c.applications > 0 ? c.successes / c.applications : 0;
    },
    apply(context: LearnedRuleContext) {
      const c = _counters.get(rule.id);
      if (c) c.applications++;
      return rule.apply(context);
    },
  });
}

/**
 * Aplica todas las reglas registradas en orden de tasa de éxito.
 * Si alguna regla cambia la ruta, aplica esa regla y registra el intento.
 * Retorna la ruta final (posiblemente modificada).
 */
export function applyLearnedRules(context: LearnedRuleContext): LearnedRouteKind {
  const sortedRules = [..._registry.values()].sort((a, b) => b.successRate - a.successRate);

  for (const rule of sortedRules) {
    const suggestion = rule.apply(context);
    if (suggestion !== null && suggestion !== context.proposedRoute) {
      return suggestion;
    }
  }

  return context.proposedRoute;
}

/**
 * Registra el éxito o fracaso de la última aplicación de una regla.
 */
export function recordLearnedRuleOutcome(ruleId: string, success: boolean): void {
  const c = _counters.get(ruleId);
  if (!c) return;
  if (success) c.successes++;
}

/**
 * Elimina reglas con tasa de éxito menor al umbral después de N usos.
 * Auto-poda las reglas que no funcionan.
 */
export function pruneIneffectiveRules(params: {
  minApplications?: number;
  minSuccessRate?: number;
}): string[] {
  const { minApplications = 3, minSuccessRate = 0.4 } = params;
  const pruned: string[] = [];

  for (const [id, rule] of _registry) {
    if (rule.applicationCount >= minApplications && rule.successRate < minSuccessRate) {
      _registry.delete(id);
      pruned.push(id);
    }
  }

  return pruned;
}

/**
 * Stats del sandbox de reglas aprendidas.
 */
export function getLearnedRulesStats(): {
  totalRules: number;
  avgSuccessRate: number;
  topRules: Array<{ id: string; successRate: number; applications: number }>;
} {
  const rules = [..._registry.values()];
  const avgSuccessRate =
    rules.length > 0 ? rules.reduce((sum, r) => sum + r.successRate, 0) / rules.length : 0;

  const topRules = rules
    .sort((a, b) => b.successRate - a.successRate)
    .slice(0, 3)
    .map((r) => ({ id: r.id, successRate: r.successRate, applications: r.applicationCount }));

  return {
    totalRules: rules.length,
    avgSuccessRate,
    topRules,
  };
}

// ── Reglas predefinidas (bootstrap) ─────────────────────────────────────────
// Estas son el "conocimiento inicial" antes de que el sistema aprenda empíricamente.

registerLearnedRule({
  id: "target_not_touched_prefer_delegate",
  sourceHypothesis:
    "When target_not_touched errors occur, omega_delegate succeeds more reliably than sessions_send",
  learnedAt: Date.now(),
  apply: (ctx) => {
    if (ctx.lastErrorKind === "target_not_touched" && ctx.proposedRoute === "sessions_send") {
      return "omega_delegate";
    }
    return null;
  },
});

registerLearnedRule({
  id: "high_failure_streak_prefer_spawn",
  sourceHypothesis: "When failureStreak > 3 with same route, sessions_spawn provides isolation",
  learnedAt: Date.now(),
  apply: (ctx) => {
    if (ctx.failureStreak > 3 && ctx.proposedRoute !== "sessions_spawn") {
      return "sessions_spawn";
    }
    return null;
  },
});
