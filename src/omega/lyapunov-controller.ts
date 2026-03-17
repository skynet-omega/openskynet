/**
 * Lyapunov Control para OpenSkyNet
 * 
 * Problema: V7_METABOLISM en SKYNET hacía gain = 1.0 + x.std() * 5.0
 * Resultado: "Epilepsia Térmica" - el sistema divergía cuando frustración era alta
 * 
 * Solución: Control de Lyapunov que:
 *   1. Mide divergencia (Lyapunov exponent) del sistema
 *   2. Cuando divergencia sube → aplica "freno inteligente"
 *   3. Cuando baja → permite más ganancia
 *   4. Resultado: Homeostasis dinámica sin suprimir autonomía
 * 
 * Inspiración: V8_OMEGA en SKYNET, Prigogine Structures Disipativas
 */

export interface LyapunovState {
  exponent: number;        // Divergencia actual (0 = estable, >0.3 = diverge)
  damping: number;         // Factor de amortiguación (0-1)
  temperatureF: number;    // "Temperatura de Fricción" (analogía termodinámica)
  dissipationRate: number; // Cuánto se disipa activamente
  isStable: boolean;       // Green light o Red light
  reason: string;          // Por qué está en ese estado
}

export class LyapunovController {
  private readonly DIVERGENCE_THRESHOLD = 0.3;    // Red line
  private readonly STABILITY_THRESHOLD = 0.15;    // Green line
  private readonly MAX_DAMPING = 0.95;           // Nunca ahogar completamente
  private readonly MIN_DAMPING = 0.1;            // Siempre permitir algo

  // Historia de divergencia para calcular tendencia
  private divergenceHistory: number[] = [];
  private readonly HISTORY_SIZE = 20;

  // Estado interno
  private lastLyapunovState: LyapunovState | null = null;
  private activationCount = 0;

  constructor() {
    console.log('[Lyapunov] Controller initialized');
  }

  /**
   * Core: Calcular divergencia de Lyapunov
   * 
   * Metrics que alimentan esto:
   *   - variance del estado latente (más variance = más divergencia)
   *   - magnitud de las derivadas (más cambio = más divergencia)
   *   - error de predicción (si no predigo bien = divergencia)
   */
  computeDivergence(
    z_current: number[],
    z_previous: number[],
    predictionError: number,
    latentVariance: number
  ): number {
    // Cambio en el estado (velocidad)
    const stateChange = Math.sqrt(
      z_current.reduce((s, v, i) => s + Math.pow(v - (z_previous[i] ?? 0), 2), 0)
    );

    // Combinación de factores: cambio + varianza + error
    // Lyapunov exponent es positivo si el sistema diverge
    const divergence =
      0.3 * stateChange +      // Velocidad de cambio
      0.4 * latentVariance +   // Variabilidad interna
      0.3 * predictionError;   // Error acumulado

    return divergence;
  }

  /**
   * Core: Aplicar control de Lyapunov
   * 
   * Entrada: divergencia
   * Salida: damping factor (0-1) a aplicar al gain de JEPA
   *         0.1 = permite ganancia
   *         0.9 = frena casi todo
   */
  computeDamping(divergence: number): number {
    // Guardar en historia
    this.divergenceHistory.push(divergence);
    if (this.divergenceHistory.length > this.HISTORY_SIZE) {
      this.divergenceHistory.shift();
    }

    // Calcular tendencia (divergencia subiendo o bajando)
    const trend = this._calculateTrend();

    // Control proporcional + integral
    let damping: number;

    if (divergence > this.DIVERGENCE_THRESHOLD) {
      // ¡ALERTA ROJA! Sistema divergiendo
      // Aplicar amortiguación fuerte, con compensación si tendencia mejora
      damping = this.MAX_DAMPING * (1 - Math.exp(-2 * (divergence - this.DIVERGENCE_THRESHOLD)));
      if (trend < 0) {
        // Tendencia mejorando, relajar un poco
        damping *= 0.8;
      }
    } else if (divergence > this.STABILITY_THRESHOLD) {
      // AMARILLO - Precaución
      // Amortiguación moderada
      damping = 0.4 + 0.3 * ((divergence - this.STABILITY_THRESHOLD) / (this.DIVERGENCE_THRESHOLD - this.STABILITY_THRESHOLD));
    } else {
      // ¡VERDE! Sistema estable
      // Permitir ganancia casi sin restricción
      damping = this.MIN_DAMPING;
    }

    // Bounded output
    damping = Math.max(this.MIN_DAMPING, Math.min(this.MAX_DAMPING, damping));

    // Crear estado
    const temperature = divergence * 100; // Analogía: divergencia = temperatura
    const dissipationRate = (1 - damping); // 1 - damping = cuánto disipamos

    const isStable = divergence <= this.STABILITY_THRESHOLD;
    const reason = isStable
      ? `Stable (divergence ${divergence.toFixed(3)} < threshold ${this.STABILITY_THRESHOLD})`
      : divergence > this.DIVERGENCE_THRESHOLD
        ? `CRITICAL DIVERGENCE (${divergence.toFixed(3)} > ${this.DIVERGENCE_THRESHOLD}). Damping at ${(damping*100).toFixed(0)}%`
        : `Caution (divergence ${divergence.toFixed(3)} in amber zone)`;

    this.lastLyapunovState = {
      exponent: divergence,
      damping,
      temperatureF: temperature,
      dissipationRate,
      isStable,
      reason,
    };

    this.activationCount++;
    return damping;
  }

  /**
   * Aplicar damping al gain de JEPA
   * 
   * Entrada: gain original (e.g., 1.5 para frustrated state)
   * Salida: gain * (1 - damping) = gain dampado
   */
  applyDampingToGain(originalGain: number, damping: number): number {
    return originalGain * (1 - damping);
  }

  /**
   * Get el último estado
   */
  getLastState(): LyapunovState | null {
    return this.lastLyapunovState;
  }

  /**
   * Predecir si el sistema divergirá en próximos pasos
   */
  predictStability(stepsAhead: number = 5): {
    prediction: 'stable' | 'warning' | 'critical';
    confidence: number;
    reason: string;
  } {
    if (this.divergenceHistory.length < 3) {
      return {
        prediction: 'stable',
        confidence: 0.5,
        reason: 'Insufficient history',
      };
    }

    const trend = this._calculateTrend();
    const currentDiv = this.divergenceHistory[this.divergenceHistory.length - 1];
    const projectedDiv = currentDiv + trend * stepsAhead;

    const confidence = Math.max(0, Math.min(1, this.divergenceHistory.length / 20));

    if (projectedDiv > this.DIVERGENCE_THRESHOLD) {
      return {
        prediction: 'critical',
        confidence,
        reason: `Projected divergence ${projectedDiv.toFixed(3)} exceeds threshold in ~${stepsAhead} steps`,
      };
    } else if (projectedDiv > this.STABILITY_THRESHOLD) {
      return {
        prediction: 'warning',
        confidence,
        reason: `Projected divergence trending toward yellow/red zone`,
      };
    } else {
      return {
        prediction: 'stable',
        confidence,
        reason: `Projected divergence ${projectedDiv.toFixed(3)} remains stable`,
      };
    }
  }

  /**
   * Exportar diagnóstico
   */
  explain(): string {
    if (!this.lastLyapunovState) {
      return '[Lyapunov] No state computed. Call computeDamping() first.';
    }

    const state = this.lastLyapunovState;
    const prediction = this.predictStability();

    return (
      `[Lyapunov Control Report]\n` +
      `  Divergence (exponent): ${state.exponent.toFixed(4)}\n` +
      `  Damping Factor: ${(state.damping * 100).toFixed(1)}%\n` +
      `  Dissipation Rate: ${(state.dissipationRate * 100).toFixed(1)}%\n` +
      `  Status: ${state.isStable ? '🟢 STABLE' : '🔴 UNSTABLE'}\n` +
      `  Temperature (analogía): ${state.temperatureF.toFixed(1)}°F\n` +
      `  Reason: ${state.reason}\n` +
      `\n  Prediction (5 steps): ${prediction.prediction.toUpperCase()} (confidence ${(prediction.confidence * 100).toFixed(0)}%)\n` +
      `  ${prediction.reason}\n` +
      `\n  Activations: ${this.activationCount}`
    );
  }

  /**
   * Helper: Calcular tendencia de divergencia
   * Regresión lineal sobre el último N valores
   */
  private _calculateTrend(): number {
    if (this.divergenceHistory.length < 2) return 0;

    const n = this.divergenceHistory.length;
    const x = Array.from({ length: n }, (_, i) => i); // 0, 1, 2, ...
    const y = this.divergenceHistory;

    const xMean = x.reduce((s, v) => s + v, 0) / n;
    const yMean = y.reduce((s, v) => s + v, 0) / n;

    const numerator = x.reduce((s, xi, i) => s + (xi - xMean) * (y[i] - yMean), 0);
    const denominator = x.reduce((s, xi) => s + (xi - xMean) ** 2, 0);

    return denominator === 0 ? 0 : numerator / denominator;
  }

  /**
   * Reset para nueva sesión
   */
  reset(): void {
    this.divergenceHistory = [];
    this.lastLyapunovState = null;
    this.activationCount = 0;
  }

  /**
   * Estadísticas
   */
  getStats() {
    return {
      activationCount: this.activationCount,
      historySize: this.divergenceHistory.length,
      lastDivergence: this.divergenceHistory[this.divergenceHistory.length - 1] ?? 0,
      avgDivergence: this.divergenceHistory.reduce((s, v) => s + v, 0) / Math.max(1, this.divergenceHistory.length),
      trend: this._calculateTrend(),
      lastState: this.lastLyapunovState,
    };
  }
}

/**
 * Singleton
 */
let lyapunovInstance: LyapunovController | null = null;

export function getLyapunovController(): LyapunovController {
  if (!lyapunovInstance) {
    lyapunovInstance = new LyapunovController();
  }
  return lyapunovInstance;
}

export function initializeLyapunovController(): LyapunovController {
  lyapunovInstance = new LyapunovController();
  return lyapunovInstance;
}
