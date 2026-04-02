/**
 * Sparse Metabolism para OpenSkyNet
 *
 * Problema: Cada ciclo de heartbeat corre TODOS los componentes
 *   - Neural Logic Engine (64 reglas)
 *   - Hierarchical Memory (query episodic)
 *   - Lyapunov Control (calcular divergencia)
 *   - Causal Reasoner (BFS sobre grafo)
 *   Resultado: Compute innecesario, latencia creciente
 *
 * Solución: "Metabolismo Disperso"
 *   - Cada componente se ejecuta SOLO cuando lo necesita
 *   - Ajusta su actividad basado en frustración actual
 *   - Resultado: Eficiencia + mayor autonomía bajo presión
 *
 * Inspiración: exp19_sparse_metabolism en EXPERIMENTOS
 */

export type ComponentType =
  | "neural_logic_engine"
  | "hierarchical_memory"
  | "lyapunov_controller"
  | "causal_reasoner"
  | "autonomy_logger"
  | "jepa_enhancer";

export interface MetabolismState {
  timestamp: number;
  frustration: number; // 0-1 input
  effectiveFrustration: number; // smoothed frustration used for activation
  surprise: number; // change magnitude vs previous frustration
  componentActivities: Record<ComponentType, number>; // 0-1 cada uno
  totalMetabolicRate: number; // 0-1 total metabolic cost
  activatedComponents: ComponentType[];
  skippedComponents: ComponentType[];
  reason: string;
}

export class SparseMetabolism {
  // Configuración de metabolismo base para cada componente
  private baseMetabolism: Record<ComponentType, number> = {
    neural_logic_engine: 0.15, // Costoso: 64 reglas
    hierarchical_memory: 0.2, // Costoso: queries + consolidación
    lyapunov_controller: 0.05, // Barato: solo matemática
    causal_reasoner: 0.1, // Moderado: BFS
    autonomy_logger: 0.02, // Muy barato: append logs
    jepa_enhancer: 0.08, // Moderado: calcula boost
  };

  // Cuando frustración sube, qué componentes se activan más agresivamente
  private frustrationMultipliers: Record<ComponentType, number> = {
    neural_logic_engine: 1.5, // Más razonamiento cuando frustrado
    hierarchical_memory: 2.0, // Más lookup de episémico
    lyapunov_controller: 3.0, // Control crítico cuando diverge
    causal_reasoner: 1.8, // Más análisis cuando estresado
    autonomy_logger: 1.0, // No cambia
    jepa_enhancer: 2.0, // Más boost cuando necesario
  };

  // Thresholds de activación (sólo pasa frustración > threshold)
  private activationThresholds: Record<ComponentType, number> = {
    neural_logic_engine: 0.0, // Siempre
    hierarchical_memory: 0.4, // Cuando hay cierta dificultad
    lyapunov_controller: 0.3, // Bastante pronto
    causal_reasoner: 0.6, // Cuando está muy frustrado
    autonomy_logger: 0.0, // Siempre
    jepa_enhancer: 0.2, // Bastante pronto
  };

  private lastState: MetabolismState | null = null;
  private activationHistory: number[] = [];
  private readonly HISTORY_SIZE = 50;
  private smoothedFrustration = 0;
  private lastObservedFrustration: number | null = null;

  constructor() {
    console.log("[Metabolism] Sparse metabolism initialized");
  }

  /**
   * Core: Calcular qué componentes ejecutar este ciclo
   *
   * Entrada: frustración actual (0-1)
   * Salida: MetabolismState con decisiones
   */
  computeMetabolism(frustration: number): MetabolismState {
    const timestamp = Date.now();
    const surprise =
      this.lastObservedFrustration === null
        ? 0
        : Math.abs(frustration - this.lastObservedFrustration);
    this.smoothedFrustration =
      this.lastObservedFrustration === null
        ? frustration
        : Math.max(0, Math.min(1, 0.78 * this.smoothedFrustration + 0.22 * frustration));
    this.lastObservedFrustration = frustration;
    const effectiveFrustration = this.smoothedFrustration;
    const componentActivities: Record<ComponentType, number> = {
      neural_logic_engine: 0,
      hierarchical_memory: 0,
      lyapunov_controller: 0,
      causal_reasoner: 0,
      autonomy_logger: 0,
      jepa_enhancer: 0,
    };

    const activatedComponents: ComponentType[] = [];
    const skippedComponents: ComponentType[] = [];

    // Para cada componente, decidir si ejecutar
    for (const [component, baseActivity] of Object.entries(this.baseMetabolism) as [
      ComponentType,
      number,
    ][]) {
      if (this.shouldActivateComponent(component, effectiveFrustration, surprise)) {
        // ¿Qué tan activo? Base + multiplier de frustración
        const multiplier = this.frustrationMultipliers[component];
        const activity = baseActivity * (1 + effectiveFrustration * multiplier);

        // Saturar entre 0 e 1
        componentActivities[component] = Math.min(1, activity);
        activatedComponents.push(component);
      } else {
        componentActivities[component] = 0;
        skippedComponents.push(component);
      }
    }

    // Metabolismo total = suma ponderada
    const totalMetabolicRate =
      Object.values(componentActivities).reduce((s, v) => s + v, 0) /
      Object.keys(componentActivities).length;

    // Guardar en historia para análisis de tendencias
    this.activationHistory.push(totalMetabolicRate);
    if (this.activationHistory.length > this.HISTORY_SIZE) {
      this.activationHistory.shift();
    }

    // Razón textual
    let reason = "";
    if (effectiveFrustration < 0.2) {
      reason = "Low frustration: minimal metabolism";
    } else if (effectiveFrustration < 0.5) {
      reason = "Moderate frustration: selective component activation";
    } else if (effectiveFrustration < 0.8) {
      reason = "High frustration: aggressive activation";
    } else {
      reason = "CRITICAL frustration: full metabolic engagement";
    }

    const state: MetabolismState = {
      timestamp,
      frustration,
      effectiveFrustration,
      surprise,
      componentActivities,
      totalMetabolicRate,
      activatedComponents,
      skippedComponents,
      reason,
    };

    this.lastState = state;
    return state;
  }

  private shouldActivateComponent(
    component: ComponentType,
    effectiveFrustration: number,
    surprise: number,
  ): boolean {
    switch (component) {
      case "neural_logic_engine":
      case "autonomy_logger":
        return true;
      case "hierarchical_memory":
        return effectiveFrustration >= 0.44 || (effectiveFrustration >= 0.28 && surprise >= 0.12);
      case "lyapunov_controller":
        return effectiveFrustration >= 0.3 || surprise >= 0.18;
      case "causal_reasoner":
        return (effectiveFrustration >= 0.65 && surprise <= 0.18) || effectiveFrustration >= 0.82;
      case "jepa_enhancer":
        return effectiveFrustration >= 0.2 || surprise >= 0.08;
      default:
        return effectiveFrustration >= this.activationThresholds[component];
    }
  }

  /**
   * Determinar si un componente debe ejecutar en este ciclo
   * Puede ser usado en heartbeat para omitir trabajo innecesario
   */
  shouldActivate(component: ComponentType): boolean {
    if (!this.lastState) return true; // Si no hay estado, ejecutar conservadoramente

    return this.lastState.activatedComponents.includes(component);
  }

  /**
   * Obtener el "duty cycle" de un componente (0-1)
   * Puedes usar esto para reducir el número de reglas/queries si es bajo
   */
  getDutyCycle(component: ComponentType): number {
    if (!this.lastState) return 0.5;
    return this.lastState.componentActivities[component];
  }

  /**
   * Predecir metabolismo futuro basado en tendencia
   */
  predictFutureMetabolism(frustrationAhead: number): {
    estimatedMetabolicRate: number;
    predictedActivations: ComponentType[];
  } {
    const metabolismState = this.computeMetabolism(frustrationAhead);
    return {
      estimatedMetabolicRate: metabolismState.totalMetabolicRate,
      predictedActivations: metabolismState.activatedComponents,
    };
  }

  /**
   * Obtener reporte
   */
  explain(): string {
    if (!this.lastState) {
      return "[Metabolism] No metabolism computed. Call computeMetabolism() first.";
    }

    const state = this.lastState;
    const avgMetabolism =
      this.activationHistory.reduce((s, v) => s + v, 0) /
      Math.max(1, this.activationHistory.length);
    const trend = this._calculateTrend();

    let report = `[Sparse Metabolism Report]\n`;
    report += `  Frustration: ${(state.frustration * 100).toFixed(1)}%\n`;
    report += `  Effective frustration: ${(state.effectiveFrustration * 100).toFixed(1)}%\n`;
    report += `  Surprise: ${(state.surprise * 100).toFixed(1)}%\n`;
    report += `  Total Metabolic Rate: ${(state.totalMetabolicRate * 100).toFixed(1)}%\n`;
    report += `  Activated Components: ${state.activatedComponents.length}/${Object.keys(state.componentActivities).length}\n`;
    report += `    ${state.activatedComponents.join(", ")}\n`;
    if (state.skippedComponents.length > 0) {
      report += `  Skipped: ${state.skippedComponents.join(", ")}\n`;
    }
    report += `\n  Component Activities:\n`;

    for (const [comp, activity] of Object.entries(state.componentActivities)) {
      const bar =
        "█".repeat(Math.round(activity * 10)) + "░".repeat(10 - Math.round(activity * 10));
      report += `    ${comp}: [${bar}] ${(activity * 100).toFixed(0)}%\n`;
    }

    report += `\n  Metrics:\n`;
    report += `    Avg metabolic rate (last ${this.activationHistory.length} cycles): ${(avgMetabolism * 100).toFixed(1)}%\n`;
    report += `    Trend: ${trend > 0 ? "📈" : trend < 0 ? "📉" : "➡️"} ${(trend * 100).toFixed(1)}% per cycle\n`;
    report += `\n  Reason: ${state.reason}`;

    return report;
  }

  /**
   * Helper: Tendencia lineal del metabolismo
   */
  private _calculateTrend(): number {
    if (this.activationHistory.length < 2) return 0;

    const n = this.activationHistory.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = this.activationHistory;

    const xMean = x.reduce((s, v) => s + v, 0) / n;
    const yMean = y.reduce((s, v) => s + v, 0) / n;

    const numerator = x.reduce((s, xi, i) => s + (xi - xMean) * (y[i] - yMean), 0);
    const denominator = x.reduce((s, xi) => s + (xi - xMean) ** 2, 0);

    return denominator === 0 ? 0 : numerator / denominator;
  }

  /**
   * Estadísticas generales
   */
  getStats() {
    return {
      lastMetaborlicRate: this.lastState?.totalMetabolicRate ?? 0,
      avgMetabolicRate:
        this.activationHistory.reduce((s, v) => s + v, 0) /
        Math.max(1, this.activationHistory.length),
      maxMetabolicRate: Math.max(...this.activationHistory, 0),
      minMetabolicRate: Math.min(...this.activationHistory, 1),
      trend: this._calculateTrend(),
      historySize: this.activationHistory.length,
    };
  }
}

/**
 * Singleton
 */
let metabolismInstance: SparseMetabolism | null = null;

export function getSparseMetabolism(): SparseMetabolism {
  if (!metabolismInstance) {
    metabolismInstance = new SparseMetabolism();
  }
  return metabolismInstance;
}

export function initializeSparseMetabolism(): SparseMetabolism {
  metabolismInstance = new SparseMetabolism();
  return metabolismInstance;
}
