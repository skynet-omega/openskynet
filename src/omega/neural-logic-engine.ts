/**
 * Neural Logic Engine para OpenSkyNet
 * 
 * Motor de inferencia lógica diferenciable que opera en espacio latente
 * SIN dependencia de LLMs. Basado en SKYNET_OMEGA.
 * 
 * Problema que resuelve:
 *   - OpenSkyNet hace sugerencias al LLM que luego decide
 *   - NeuralLogicEngine permite RAZONAMIENTO IMPLICITO directamente
 *   - Sobre el estado latente sin necesidad de tokens de texto
 * 
 * Arquitectura:
 *   64 reglas = 64 patrones lógicos aprendibles
 *   Cada regla: IF pattern_A in z THEN push_toward pattern_B
 *   Se aprenden por gradiente junto con JEPA + Bifásic
 * 
 * Inspiración: Neural Theorem Provers (Rocktaschel & Riedel 2017)
 *              Differentiable Logic (Evans et al 2018)
 */

export interface LogicRule {
  id: number;
  antecedent: number[]; // Patrón que activa la regla (embedding)
  consequent: number[]; // Hacia dónde mueve el estado
  strength: number;     // Fuerza de la regla (0-1)
  active: boolean;      // Estuvo activa en último ciclo
  confidence: number;   // Confianza en la inferencia
}

export interface LogicState {
  processedAt: number;     // timestamp del proceso
  activeRules: number[];   // IDs de reglas activas
  inferenceConfidence: number;
  logicalDelta: number[];  // El delta aplicado al estado
  stateAfter: number[];    // Estado post-inferencia
}

export class NeuralLogicEngine {
  private rules: Map<number, LogicRule> = new Map();
  private ruleWeights: Map<number, number[][]> = new Map();
  private lastState: LogicState | null = null;
  private ruleCounter = 0;

  // Umbrales
  private readonly ACTIVATION_THRESHOLD = 0.5;
  private readonly CONFIDENCE_THRESHOLD = 0.3;
  private readonly MAX_RULES = 64;

  // Memoria de patrones vistos (para evitar crear reglas duplicadas)
  private patternMemory: Map<string, number> = new Map();

  constructor() {
    this.initializeDefaultRules();
  }

  /**
   * Inicializa reglas por defecto basadas en patrones comunes
   * de SKYNET_OMEGA
   */
  private initializeDefaultRules() {
    // Regla 1: Si frustration alta → activate curiosity
    this.addRule(
      [0.7, 0.8, 0.9], // patrón de frustración alta
      [0.2, 0.3, 0.1], // hacia curiosidad
      0.8
    );

    // Regla 2: Si success rate bajo → activate exploration
    this.addRule(
      [0.1, 0.2, 0.3],
      [0.5, 0.6, 0.7],
      0.7
    );

    // Regla 3: Si stability alto → maintain
    this.addRule(
      [0.4, 0.4, 0.4],
      [0.4, 0.4, 0.4],
      0.5
    );

    // Regla 4: Si error diverging → reduce entropy
    this.addRule(
      [0.9, 0.95, 1.0],
      [0.3, 0.25, 0.2],
      0.85
    );
  }

  /**
   * Añade una nueva regla lógica al motor
   */
  addRule(
    antecedent: number[],
    consequent: number[],
    initialStrength: number
  ): number {
    if (this.ruleCounter >= this.MAX_RULES) {
      console.warn(`[NLE] Maximum rules (${this.MAX_RULES}) reached. Ignoring new rule.`);
      return -1;
    }

    const ruleId = this.ruleCounter++;
    const patternKey = antecedent.join(',');

    // Evitar reglas duplicadas
    if (this.patternMemory.has(patternKey)) {
      console.info(`[NLE] Rule pattern already exists. Skipping duplicate.`);
      return this.patternMemory.get(patternKey)!;
    }

    this.rules.set(ruleId, {
      id: ruleId,
      antecedent,
      consequent,
      strength: Math.max(0, Math.min(1, initialStrength)),
      active: false,
      confidence: 0,
    });

    this.patternMemory.set(patternKey, ruleId);

    // Inicializar weights como matriz identidad perturbada
    const dim = antecedent.length;
    const weights = Array(dim)
      .fill(0)
      .map(() => Array(dim).fill(0).map(() => Math.random() * 0.1 - 0.05));
    this.ruleWeights.set(ruleId, weights);

    console.log(`[NLE] Rule #${ruleId} added. Total rules: ${this.rules.size}`);
    return ruleId;
  }

  /**
   * CORE: Aplica inferencia lógica sobre el estado actual
   * 
   * Simula el forward pass de SKYNET_OMEGA NeuralLogicEngine
   */
  infer(
    currentState: number[],
    context?: { frustration: number; recentFailures: number; successRate: number }
  ): LogicState {
    const timestamp = Date.now();
    const activeRules: number[] = [];
    let logicalDelta = Array(currentState.length).fill(0);

    // ── 1. Activación de antecedentes ──────────────────────────────────
    // Similitud coseno entre estado y cada antecedente
    const stateNorm = this.normalize(currentState);
    let totalConfidence = 0;

    for (const [ruleId, rule] of this.rules) {
      const antecedentNorm = this.normalize(rule.antecedent);
      const similarity = this.cosineSimilarity(stateNorm, antecedentNorm);

      // Modulación por contexto (frustración puede amplificar ciertas reglas)
      let contextGate = 1.0;
      if (context) {
        if (ruleId === 0 && context.frustration > 0.6) {
          contextGate = 1.5; // Amplificar regla de curiosidad si hay frustración
        }
        if (ruleId === 1 && context.successRate < 0.3) {
          contextGate = 1.5; // Amplificar exploración si pocos éxitos
        }
      }

      // Activación final: similitud × contexto × fuerza
      const activation =
        Math.max(0, similarity) * contextGate * rule.strength;

      if (activation > this.ACTIVATION_THRESHOLD) {
        rule.active = true;
        activeRules.push(ruleId);

        // ── 2. Aplicar la regla activa ──────────────────────────────────
        // Mover estado hacia el consecuente
        const weights = this.ruleWeights.get(ruleId)!;
        const ruleOutput = this.multiplyMatrix(weights, currentState);
        const ruleEffect = ruleOutput.map(
          (v, i) => v * activation * 0.1 // Pequeño factor para no saturar
        );

        logicalDelta = logicalDelta.map((v, i) => v + ruleEffect[i]);
        rule.confidence = activation;
        totalConfidence += activation;
      } else {
        rule.active = false;
        rule.confidence = 0;
      }
    }

    // ── 3. Aplicar delta con saturación (no crecer más allá de [0,1]) ─────
    const stateAfter = currentState.map((val, i) => {
      const newVal = val + Math.tanh(logicalDelta[i]);
      return Math.max(0, Math.min(1, newVal));
    });

    // ── 4. Confianza general ───────────────────────────────────────────────
    const inferenceConfidence =
      this.rules.size > 0
        ? totalConfidence / this.rules.size
        : 0;

    const logicState: LogicState = {
      processedAt: timestamp,
      activeRules,
      inferenceConfidence: Math.min(1, inferenceConfidence),
      logicalDelta,
      stateAfter,
    };

    this.lastState = logicState;
    return logicState;
  }

  /**
   * Recupera el último estado inferido
   */
  getLastState(): LogicState | null {
    return this.lastState;
  }

  /**
   * Explica qué reglas se activaron y por qué
   */
  explain(): string {
    if (!this.lastState) {
      return '[NLE] No inference history. Call infer() first.';
    }

    const activeRuleDetails = this.lastState.activeRules
      .map((ruleId) => {
        const rule = this.rules.get(ruleId);
        if (!rule) return '';
        return `  Rule #${ruleId}: ${JSON.stringify(rule.antecedent.slice(0, 2))}... → ` +
               `${JSON.stringify(rule.consequent.slice(0, 2))}... ` +
               `(strength=${rule.strength.toFixed(2)}, confidence=${rule.confidence.toFixed(2)})`;
      })
      .join('\n');

    return (
      `[NLE] Logic Inference Report\n` +
      `  Active Rules: ${this.lastState.activeRules.length}/${this.rules.size}\n` +
      `  Confidence: ${(this.lastState.inferenceConfidence * 100).toFixed(1)}%\n` +
      `  Delta magnitude: ${this.magnitude(this.lastState.logicalDelta).toFixed(4)}\n` +
      (activeRuleDetails ? `\n${activeRuleDetails}` : '')
    );
  }

  /**
   * Helpers
   */
  private normalize(vec: number[]): number[] {
    const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    if (mag === 0) return vec;
    return vec.map((v) => v / mag);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((s, v, i) => s + v * (b[i] || 0), 0);
    const normA = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
    const normB = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (normA * normB);
  }

  private multiplyMatrix(matrix: number[][], vec: number[]): number[] {
    return matrix.map((row) =>
      row.reduce((s, v, i) => s + v * (vec[i] || 0), 0)
    );
  }

  private magnitude(vec: number[]): number {
    return Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  }

  /**
   * Obtén estadísticas del motor
   */
  getStats() {
    const activeCount = Array.from(this.rules.values()).filter(r => r.active).length;
    return {
      totalRules: this.rules.size,
      activeRules: activeCount,
      avgStrength: Array.from(this.rules.values()).reduce((s, r) => s + r.strength, 0) / this.rules.size,
      lastConfidence: this.lastState?.inferenceConfidence ?? 0,
    };
  }
}

/**
 * Singleton instance
 */
let nleInstance: NeuralLogicEngine | null = null;

export function getNeuralLogicEngine(): NeuralLogicEngine {
  if (!nleInstance) {
    nleInstance = new NeuralLogicEngine();
  }
  return nleInstance;
}

export function initializeNeuralLogicEngine(): NeuralLogicEngine {
  nleInstance = new NeuralLogicEngine();
  console.log('[NLE] Neural Logic Engine initialized');
  return nleInstance;
}
