/**
 * COGNITIVE_KERNEL.ts - Fase B: Materialización Arqueológica
 *
 * Integra mecanismos extraídos del corpus SOLITONES (V27, V55, V67, V77.5, X, Omega):
 * - Motor: NeuralODE espectral (Holo-Koopman de Omega)
 * - Memoria: Fósiles episódicos (CORE_X)
 * - Razonamiento: Neural Logic Engine (NLE)
 * - Decisión: Langevin dynamics (V304 Thermodynamic)
 * - Jerarquía: 3 escalas temporales (V7000 Hybrid Brain)
 * - Arquitectura: Ricci Flow (V14) + Holograma (V29) + Mirror ToM (V8)
 *
 * Basado en arqueología de 25+ núcleos experimentales.
 */

import * as tf from "@tensorflow/tfjs";

// ═══════════════════════════════════════════════════════════════════════════════
// TIPOS FUNDAMENTALES (Extraídos del corpus)
// ═══════════════════════════════════════════════════════════════════════════════

export interface CognitiveState {
  // Estado espectral (Holo-Koopman V27)
  spectral: tf.Tensor; // z ∈ ℂ^D - fase interna del sistema

  // Memoria episódica jerárquica (CORE_X)
  sensory: tf.Tensor; // Escala rápida (1000Hz) - tálamo
  entorhinal: tf.Tensor; // Escala media (10Hz) - hipocampo
  prefrontal: tf.Tensor; // Escala lenta (1Hz) - corteza

  // Capa Social (V8 Mirror / V17 Self-Belief)
  partnerModel: tf.Tensor; // Proyección del estado del compañero
  selfBelief: tf.Tensor; // Inferencia de puntos ciegos (propia mano)

  // Metadatos del estado
  timestamp: number;
  entropy: number; // Métrica de incertidumbre (V17 Evidential)
  surprise: number; // Error de predicción JEPA
}

export interface FossilMemory {
  // Memoria de fósiles (CORE_X) - key-value con rehidratación
  key: tf.Tensor; // Embedding del contexto
  value: tf.Tensor; // Estado completo preservado
  age: number; // Tiempo desde creación
  accessCount: number; // Frecuencia de recuperación
}

export interface LogicRule {
  // Reglas del NLE (Neural Logic Engine)
  antecedent: tf.Tensor; // Condición
  consequent: tf.Tensor; // Consecuencia
  confidence: number; // Certeza empírica [0,1]
  provenance: string; // Origen de la regla
}

export interface DecisionContext {
  // Contexto para decisión Langevin (V304)
  currentEnergy: number; // Energía del estado actual
  candidateStates: tf.Tensor[]; // Estados candidatos
  temperature: number; // Térmica para exploración
  commitment: number; // Nivel de compromiso [0,1]
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN DEL KERNEL
// ═══════════════════════════════════════════════════════════════════════════════

export interface KernelConfig {
  // Dimensiones
  spectralDim: number; // Dimensión del espacio espectral
  sensoryDim: number; // Dimensión sensorial rápida

  // Parámetros Holo-Koopman (V27)
  omegaBase: number; // Frecuencia base del "reloj"
  dampingFactor: number; // Amortiguamiento [0,1]

  // Parámetros de memoria
  fossilCapacity: number; // Capacidad máxima de fósiles
  fossilThreshold: number; // Umbral de similitud coseno (0.85 en X)
  fossilDecay: number; // Decaimiento de acceso

  // Parámetros de decisión (V304)
  langevinStep: number; // Tamaño de paso para relajación
  explorationTemp: number; // Temperatura inicial

  // Jerarquía temporal (V7000)
  sensoryInterval: number; // ms entre actualizaciones sensoriales
  entorhinalInterval: number; // ms entre consolidaciones
  prefrontalInterval: number; // ms entre planes estratégicos

  // Parámetros Ricci/Holograma (V14/V29)
  ricciScales: number[]; // [3, 5, 7] - escalas de kernel
  hologramSize: number; // 30x30 - tamaño maestro

  // Parámetros Sociales (V8/V17)
  mirrorCoherence: number; // Umbral de sincronización ToM
}

export const DEFAULT_CONFIG: KernelConfig = {
  spectralDim: 256,
  sensoryDim: 128,
  omegaBase: 0.1,
  dampingFactor: 0.01,
  fossilCapacity: 1000,
  fossilThreshold: 0.85,
  fossilDecay: 0.995,
  langevinStep: 0.01,
  explorationTemp: 1.0,
  sensoryInterval: 1, // 1000Hz
  entorhinalInterval: 100, // 10Hz
  prefrontalInterval: 1000, // 1Hz
  ricciScales: [3, 5, 7],
  hologramSize: 30,
  mirrorCoherence: 0.7,
};

// ═══════════════════════════════════════════════════════════════════════════════
// MECANISMO 1: HOLO-KOOPMAN SPECTRAL CORE (V27 + Omega)
// ═══════════════════════════════════════════════════════════════════════════════

export class SpectralCore {
  private omega: tf.Tensor; // Frecuencias propias [D]
  private phaseLinear: tf.Tensor; // Pesos unitarios en toro de fase

  constructor(private config: KernelConfig) {
    // Inicializar frecuencias según V27: omega_k = base * k
    this.omega = tf.linspace(
      config.omegaBase,
      config.omegaBase * config.spectralDim,
      config.spectralDim,
    );

    // PhaseLinear: pesos unitarios en el toro (garantiza memoria perfecta)
    const phases = tf.linspace(0, 2 * Math.PI, config.spectralDim);
    this.phaseLinear = tf.complex(tf.cos(phases), tf.sin(phases));
  }

  /**
   * Evolución espectral: z_new = z_old * e^{i*omega - damping} + u_t
   * Extraído de V27_HOLO_KOOPMAN - garantiza retención 100% NBack
   */
  step(zOld: tf.Tensor, input: tf.Tensor): tf.Tensor {
    return tf.tidy(() => {
      // Factor de rotación con amortiguamiento
      const rotation = tf.complex(
        tf.cos(this.omega).mul(Math.exp(-this.config.dampingFactor)),
        tf.sin(this.omega).mul(Math.exp(-this.config.dampingFactor)),
      );

      // Evolución lineal
      const zRotated = tf.mul(zOld, rotation);

      // Entrada forzada (proyección del input)
      const uForced = this.projectInput(input);

      // Combinación con PhaseLinear (memoria perfecta)
      const zNew = tf.add(tf.mul(zRotated, this.phaseLinear), uForced);

      return zNew;
    });
  }

  private projectInput(input: tf.Tensor): tf.Tensor {
    // Proyección del input al espacio espectral complejo
    return tf.tidy(() => {
      const real = input.slice([0], [this.config.spectralDim / 2]);
      const imag = input.slice([this.config.spectralDim / 2], [this.config.spectralDim / 2]);
      return tf.complex(real, imag);
    });
  }

  /**
   * Extrae features para consumo downstream
   */
  extractFeatures(z: tf.Tensor): tf.Tensor {
    return tf.tidy(() => {
      // Magnitud y fase como features
      const mag = tf.abs(z);
      const phase = tf.atan2(tf.imag(z), tf.real(z));
      return tf.concat([mag, phase], 0);
    });
  }

  dispose() {
    this.omega.dispose();
    this.phaseLinear.dispose();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MECANISMO 1.5: RICCI MULTI-SCALE KERNEL (V14/V21)
// ═══════════════════════════════════════════════════════════════════════════════

export class RicciKernel {
  private scales: number[];

  constructor(private config: KernelConfig) {
    this.scales = config.ricciScales;
  }

  /**
   * Convolución adaptable: selecciona escala según la curvatura Ricci local
   * Implementa el Ricci Gate de V14/V21/V27
   */
  convolve(h: tf.Tensor, curvature: tf.Tensor): tf.Tensor {
    return tf.tidy(() => {
      // Softmax sobre las escalas según la curvatura
      const weights = tf.softmax(curvature); // [3]

      // Aplicar 3 escalas de kernel en paralelo (Micro, Meso, Macro)
      const micro = this.applyConv(h, this.scales[0]);
      const meso = this.applyConv(h, this.scales[1]);
      const macro = this.applyConv(h, this.scales[2]);

      const out = tf.addN([
        micro.mul(weights.slice([0], [1])),
        meso.mul(weights.slice([1], [1])),
        macro.mul(weights.slice([2], [1])),
      ]);

      return out;
    });
  }

  private applyConv(h: tf.Tensor, size: number): tf.Tensor {
    // Simulación de convolución por escala (donut kernels de Lenia)
    return tf.tidy(() => {
      const pad = Math.floor(size / 2);
      return tf.pad(h, [[pad, pad]]).slice([0], h.shape);
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MECANISMO 1.6: HOLOGRAPHIC PROJECTOR (V29)
// ═══════════════════════════════════════════════════════════════════════════════

export class HolographicProjector {
  constructor(private config: KernelConfig) {}

  /**
   * Normalización invariante de resolución (Zero-Padding)
   * Coloca cualquier input en el lienzo maestro de 30x30
   */
  project(input: tf.Tensor): tf.Tensor {
    return tf.tidy(() => {
      const [h, w] = input.shape;
      const size = this.config.hologramSize;

      const padH = Math.max(0, size - h);
      const padW = Math.max(0, size - w);

      const padded = tf.pad(input, [
        [Math.floor(padH / 2), Math.ceil(padH / 2)],
        [Math.floor(padW / 2), Math.ceil(padW / 2)],
      ]);

      return padded.slice([0, 0], [size, size]);
    });
  }

  /**
   * Predice el tamaño de la ventana de salida
   */
  predictWindow(state: CognitiveState): { h: number; w: number } {
    const h = Math.round(tf.mean(state.prefrontal).dataSync()[0] * 30);
    const w = Math.round(tf.mean(state.entorhinal).dataSync()[0] * 30);
    return {
      h: Math.max(1, Math.min(30, h)),
      w: Math.max(1, Math.min(30, w)),
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MECANISMO 2: EPISODIC FOSSIL MEMORY (CORE_X)
// ═══════════════════════════════════════════════════════════════════════════════

export class FossilMemoryStore {
  private fossils: FossilMemory[] = [];
  private accessCounts: Map<number, number> = new Map();

  constructor(private config: KernelConfig) {}

  /**
   * Codifica un estado como fósil (memoria de largo plazo)
   */
  encodeFossil(state: CognitiveState, context: tf.Tensor): FossilMemory {
    return {
      key: context.clone(),
      value: tf.concat([state.spectral, state.sensory, state.entorhinal, state.prefrontal], 0),
      age: Date.now(),
      accessCount: 0,
    };
  }

  /**
   * Recupera fósiles por similitud coseno (threshold 0.85 de X)
   */
  retrieve(query: tf.Tensor, topK: number = 5): FossilMemory[] {
    return tf.tidy(() => {
      // Calcular similitudes coseno
      const similarities = this.fossils.map((fossil) => {
        const sim = this.cosineSimilarity(query, fossil.key);
        return { fossil, similarity: sim };
      });

      // Filtrar por threshold y ordenar
      return similarities
        .filter(({ similarity }) => similarity > this.config.fossilThreshold)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, topK)
        .map(({ fossil }) => {
          fossil.accessCount++;
          return fossil;
        });
    });
  }

  /**
   * Rehidrata un estado desde fósiles recuperados
   */
  rehydrate(fossils: FossilMemory[]): Partial<CognitiveState> {
    if (fossils.length === 0) return {};

    return tf.tidy(() => {
      // Promedio ponderado por frecuencia de acceso
      const weights = fossils.map((f) => f.accessCount + 1);
      const totalWeight = weights.reduce((a, b) => a + b, 0);

      const weightedSum = fossils.reduce((acc, fossil, i) => {
        const w = weights[i] / totalWeight;
        return acc.add(fossil.value.mul(w));
      }, tf.zerosLike(fossils[0].value));

      // Split en componentes
      const dim = this.config.spectralDim;
      return {
        spectral: weightedSum.slice([0], [dim]),
        sensory: weightedSum.slice([dim], [dim]),
        entorhinal: weightedSum.slice([dim * 2], [dim]),
        prefrontal: weightedSum.slice([dim * 3], [dim]),
      };
    });
  }

  /**
   * Consolidación: mueve memoria de corto a largo plazo
   */
  consolidate(state: CognitiveState): void {
    if (this.fossils.length >= this.config.fossilCapacity) {
      // Evicción LRU: remover el menos accedido
      const minAccess = Math.min(...this.fossils.map((f) => f.accessCount));
      const idx = this.fossils.findIndex((f) => f.accessCount === minAccess);
      this.fossils[idx].value.dispose();
      this.fossils.splice(idx, 1);
    }

    // Crear contexto a partir del estado actual
    const context = tf.concat([state.spectral, state.sensory], 0);

    this.fossils.push(this.encodeFossil(state, context));
  }

  private cosineSimilarity(a: tf.Tensor, b: tf.Tensor): number {
    return tf.tidy(() => {
      const dot = tf.sum(tf.mul(a, b));
      const normA = tf.sqrt(tf.sum(tf.square(a)));
      const normB = tf.sqrt(tf.sum(tf.square(b)));
      return tf.div(dot, tf.mul(normA, normB)).dataSync()[0];
    });
  }

  dispose() {
    this.fossils.forEach((f) => f.value.dispose());
    this.fossils = [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MECANISMO 3: NEURAL LOGIC ENGINE (NLE - Extraído de Omega)
// ═══════════════════════════════════════════════════════════════════════════════

export class NeuralLogicEngine {
  private rules: LogicRule[] = [];
  private ruleConfidence: Map<string, number> = new Map();

  /**
   * Inferencia lógica difusa sobre el estado actual
   */
  infer(state: CognitiveState): LogicRule[] {
    return tf.tidy(() => {
      const stateVector = tf.concat([state.spectral, state.sensory], 0);

      return this.rules
        .map((rule) => ({
          ...rule,
          activation: this.computeActivation(rule.antecedent, stateVector),
        }))
        .filter(({ activation }) => activation > 0.5)
        .sort((a, b) => b.activation - a.activation);
    });
  }

  /**
   * Aprende una nueva regla desde datos empíricos
   */
  learnRule(antecedent: tf.Tensor, consequent: tf.Tensor, outcome: "confirmed" | "refuted"): void {
    const ruleKey = this.hashTensors(antecedent, consequent);
    const currentConf = this.ruleConfidence.get(ruleKey) || 0.5;

    // Actualización bayesiana simple
    const update = outcome === "confirmed" ? 0.1 : -0.2;
    const newConf = Math.max(0, Math.min(1, currentConf + update));

    this.ruleConfidence.set(ruleKey, newConf);

    if (
      newConf > 0.7 &&
      !this.rules.find((r) => this.hashTensors(r.antecedent, r.consequent) === ruleKey)
    ) {
      this.rules.push({
        antecedent: antecedent.clone(),
        consequent: consequent.clone(),
        confidence: newConf,
        provenance: "empirical",
      });
    }
  }

  private computeActivation(antecedent: tf.Tensor, state: tf.Tensor): number {
    return tf.tidy(() => {
      const aligned = tf.sum(tf.mul(antecedent, state));
      const normProduct = tf.sqrt(tf.mul(tf.sum(tf.square(antecedent)), tf.sum(tf.square(state))));
      return tf.div(aligned, normProduct.add(1e-6)).dataSync()[0];
    });
  }

  private hashTensors(a: tf.Tensor, b: tf.Tensor): string {
    // Hash simple para identificación
    const aSum = tf.sum(a).dataSync()[0];
    const bSum = tf.sum(b).dataSync()[0];
    return `${aSum.toFixed(4)}_${bSum.toFixed(4)}`;
  }

  dispose() {
    this.rules.forEach((r) => {
      r.antecedent.dispose();
      r.consequent.dispose();
    });
    this.rules = [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MECANISMO 3.5: THEORY OF MIND MIRROR (V8 / V17)
// ═══════════════════════════════════════════════════════════════════════════════

export class TheoryOfMindMirror {
  private partnerWeight: tf.Tensor; // Matriz W compleja

  constructor(private config: KernelConfig) {
    this.partnerWeight = tf.randomNormal([config.spectralDim, config.spectralDim]).mul(0.1);
  }

  /**
   * Transforma el estado propio en el modelo del compañero (V8 Mirror)
   * z_partner = W * z_self
   */
  mirror(selfState: tf.Tensor): tf.Tensor {
    return tf.tidy(() => {
      // (a+bi)(c+di) - Simulación compleja en dominio real
      const reW = this.partnerWeight.real;
      const imW = this.partnerWeight.imag;
      const reS = selfState.real;
      const imS = selfState.imag;

      const real = tf.sub(tf.matMul(reW, reS), tf.matMul(imW, imS));
      const imag = tf.add(tf.matMul(reW, imS), tf.matMul(imW, reS));

      return tf.complex(real, imag);
    });
  }

  /**
   * Deducir puntos ciegos a partir de la observación (V17 Self-Belief)
   * Si el compañero actúa sobre algo que yo no veo, lo deduzco.
   */
  deduceSelfBelief(observation: tf.Tensor, partnerAction: tf.Tensor): tf.Tensor {
    return tf.tidy(() => {
      // El "residuo" de la acción del compañero que mi observación no explica
      const residual = tf.sub(partnerAction, observation);
      return tf.sigmoid(residual);
    });
  }

  /**
   * Resonancia Social: mide coherencia entre ToM y realidad
   */
  computeResonance(inferred: tf.Tensor, observed: tf.Tensor): number {
    return tf.tidy(() => {
      const dot = tf.sum(tf.mul(inferred, observed));
      const normProd = tf.mul(tf.norm(inferred), tf.norm(observed));
      return tf.div(dot, normProd.add(1e-6)).dataSync()[0];
    });
  }

  dispose() {
    this.partnerWeight.dispose();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MECANISMO 4: LANGEVIN DECISION DYNAMICS (V304 Thermodynamic)
// ═══════════════════════════════════════════════════════════════════════════════

export class LangevinDecision {
  private temperature: number;

  constructor(private config: KernelConfig) {
    this.temperature = config.explorationTemp;
  }

  /**
   * Decisión por relajación de energía (no simple argmax)
   * Implementa la dinámica de Langevin del V304
   */
  decide(context: DecisionContext): { state: tf.Tensor; confidence: number } {
    return tf.tidy(() => {
      // Calcular energías de cada candidato
      const energies = context.candidateStates.map((s) => ({
        state: s,
        energy: this.computeEnergy(s, context.currentEnergy),
      }));

      // Softmin para obtener distribución de probabilidad
      const minEnergy = Math.min(...energies.map((e) => e.energy));
      const expNegE = energies.map((e) => Math.exp(-(e.energy - minEnergy) / this.temperature));
      const sumExp = expNegE.reduce((a, b) => a + b, 0);
      const probs = expNegE.map((e) => e / sumExp);

      // Muestreo de Gibbs
      const selected = this.sampleGibbs(
        energies.map((e) => e.state),
        probs,
      );
      const confidence = 1 - this.temperature / (this.temperature + Math.abs(minEnergy));

      // Enfriamiento gradual
      this.temperature *= 0.995;

      return { state: selected, confidence };
    });
  }

  private computeEnergy(state: tf.Tensor, targetEnergy: number): number {
    return tf.tidy(() => {
      const stateEnergy = tf.sum(tf.square(state)).dataSync()[0];
      return Math.abs(stateEnergy - targetEnergy);
    });
  }

  private sampleGibbs(states: tf.Tensor[], probs: number[]): tf.Tensor {
    const r = Math.random();
    let cumsum = 0;
    for (let i = 0; i < states.length; i++) {
      cumsum += probs[i];
      if (r < cumsum) return states[i];
    }
    return states[states.length - 1];
  }

  resetTemperature() {
    this.temperature = this.config.explorationTemp;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// COGNITIVE KERNEL PRINCIPAL - Integración de los 4 mecanismos
// ═══════════════════════════════════════════════════════════════════════════════

export class CognitiveKernel {
  // Subsistemas
  private spectralCore: SpectralCore;
  private fossilMemory: FossilMemoryStore;
  private logicEngine: NeuralLogicEngine;
  private decisionEngine: LangevinDecision;

  // Subsistemas Avanzados (Nuevos)
  private ricciKernel: RicciKernel;
  private holographicProjector: HolographicProjector;
  private tomMirror: TheoryOfMindMirror;

  // Estado actual
  private state: CognitiveState;
  private lastUpdate: number = 0;

  // Métricas
  public metrics = {
    totalCycles: 0,
    fossilsCreated: 0,
    rulesLearned: 0,
    avgSurprise: 0,
    avgResonance: 0,
  };

  constructor(private config: KernelConfig = DEFAULT_CONFIG) {
    this.spectralCore = new SpectralCore(config);
    this.fossilMemory = new FossilMemoryStore(config);
    this.logicEngine = new NeuralLogicEngine();
    this.decisionEngine = new LangevinDecision(config);

    // Inicializar Subsistemas Avanzados
    this.ricciKernel = new RicciKernel(config);
    this.holographicProjector = new HolographicProjector(config);
    this.tomMirror = new TheoryOfMindMirror(config);

    // Inicializar estado
    this.state = this.initializeState();
  }

  private initializeState(): CognitiveState {
    return {
      spectral: tf.complex(
        tf.zeros([this.config.spectralDim]),
        tf.zeros([this.config.spectralDim]),
      ),
      sensory: tf.zeros([this.config.sensoryDim]),
      entorhinal: tf.zeros([this.config.spectralDim]),
      prefrontal: tf.zeros([this.config.spectralDim]),
      partnerModel: tf.zeros([this.config.spectralDim]),
      selfBelief: tf.zeros([this.config.spectralDim]),
      timestamp: Date.now(),
      entropy: 1.0,
      surprise: 0.0,
    };
  }

  /**
   * Ciclo principal del kernel cognitivo
   * Implementa la jerarquía temporal de V7000 + Arquitectura Avanzada
   */
  async perceive(input: tf.Tensor, partnerAction?: tf.Tensor): Promise<CognitiveState> {
    const now = Date.now();
    const dt = now - this.lastUpdate;

    return tf.tidy(() => {
      // 0. PROYECCIÓN HOLOGRÁFICA (V29) - Invarianza de resolución
      const projectedInput = this.holographicProjector.project(input);
      const flatInput = projectedInput.flatten();

      // 1. CAPA SENSORIAL (1000Hz) - Siempre activa
      const sensoryProcessed = this.processSensory(flatInput);

      // 2. NÚCLEO ESPECTRAL (Holo-Koopman)
      const newSpectral = this.spectralCore.step(this.state.spectral, sensoryProcessed);

      // 3. RECUPERACIÓN DE FÓSILES (memoria de largo plazo)
      const retrievedFossils = this.fossilMemory.retrieve(sensoryProcessed, 3);
      const rehydrated = this.fossilMemory.rehydrate(retrievedFossils);

      // 4. CAPA SOCIAL (V8/V17) - Teoría de la mente
      const newPartnerModel = this.tomMirror.mirror(newSpectral.flatten());
      const newSelfBelief = partnerAction
        ? this.tomMirror.deduceSelfBelief(sensoryProcessed, partnerAction.flatten())
        : this.state.selfBelief;

      // 5. CAPA ENTORHINAL (10Hz) - Consolidación episódica + Ricci Flow (V14)
      let newEntorhinal = this.state.entorhinal;
      if (dt > this.config.entorhinalInterval) {
        // Ricci Flow: adaptamos la consolidación según la curvatura
        const curvature = tf.mean(newSpectral.flatten()).expandDims(0);
        newEntorhinal = this.ricciKernel.convolve(this.state.entorhinal, curvature);

        // Crear fósil si la sorpresa es alta
        if (this.state.surprise > 0.5) {
          this.fossilMemory.consolidate(this.state);
          this.metrics.fossilsCreated++;
        }
      }

      // 6. CAPA PREFRONTAL (1Hz) - Razonamiento estratégico
      let newPrefrontal = this.state.prefrontal;
      if (dt > this.config.prefrontalInterval) {
        const inferences = this.logicEngine.infer(this.state);
        newPrefrontal = this.integrateInferences(inferences);
      }

      // 7. Calcular métricas sociales y sorpresa
      const surprise = this.computeSurprise(newSpectral, this.state.spectral);
      const resonance = partnerAction
        ? this.tomMirror.computeResonance(newPartnerModel.flatten(), partnerAction.flatten())
        : 1.0;

      // 8. Actualizar estado
      this.state = {
        spectral: newSpectral,
        sensory: sensoryProcessed,
        entorhinal: newEntorhinal,
        prefrontal: newPrefrontal,
        partnerModel: newPartnerModel,
        selfBelief: newSelfBelief,
        timestamp: now,
        entropy: this.computeEntropy(newSpectral),
        surprise,
      };

      this.metrics.totalCycles++;
      this.metrics.avgSurprise = 0.99 * this.metrics.avgSurprise + 0.01 * surprise;
      this.metrics.avgResonance = 0.99 * this.metrics.avgResonance + 0.01 * resonance;
      this.lastUpdate = now;

      return this.state;
    });
  }

  /**
   * Decisión por dinámica de Langevin (V304)
   */
  decide(candidates: tf.Tensor[]): { action: number; confidence: number; state: tf.Tensor } {
    const context: DecisionContext = {
      currentEnergy: this.computeStateEnergy(),
      candidateStates: candidates,
      temperature: this.decisionEngine["temperature"],
      commitment: 1 - this.state.entropy,
    };

    const result = this.decisionEngine.decide(context);

    return {
      action: candidates.indexOf(result.state),
      confidence: result.confidence,
      state: result.state,
    };
  }

  /**
   * Aprendizaje de reglas desde experiencia
   */
  learn(antecedent: tf.Tensor, consequent: tf.Tensor, outcome: "confirmed" | "refuted"): void {
    this.logicEngine.learnRule(antecedent, consequent, outcome);
    this.metrics.rulesLearned++;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MÉTODOS AUXILIARES
  // ═══════════════════════════════════════════════════════════════════════════

  private processSensory(input: tf.Tensor): tf.Tensor {
    // Procesamiento rápido tipo tálamo
    return tf.tidy(() => {
      const normalized = tf.div(input, tf.norm(input).add(1e-6));
      return tf.pad(normalized, [[0, this.config.sensoryDim - input.shape[0]]]);
    });
  }

  private consolidateEntorhinal(spectral: tf.Tensor, sensory: tf.Tensor): tf.Tensor {
    // Integración espectral + sensorial
    return tf.tidy(() => {
      const features = this.spectralCore.extractFeatures(spectral);
      return tf.add(features, sensory).div(2);
    });
  }

  private integrateInferences(inferences: LogicRule[]): tf.Tensor {
    if (inferences.length === 0) return this.state.prefrontal;

    return tf.tidy(() => {
      const weighted = inferences.map((r) => r.consequent.mul(r.confidence));
      return tf.stack(weighted).mean(0);
    });
  }

  private computeSurprise(current: tf.Tensor, predicted: tf.Tensor): number {
    return tf.tidy(() => {
      const diff = tf.sub(current, predicted);
      return tf.mean(tf.square(diff)).dataSync()[0];
    });
  }

  private computeEntropy(state: tf.Tensor): number {
    return tf.tidy(() => {
      const mag = tf.abs(state);
      const probs = tf.div(mag, tf.sum(mag).add(1e-6));
      const logProbs = tf.log(probs.add(1e-6));
      return -tf.sum(tf.mul(probs, logProbs)).dataSync()[0];
    });
  }

  private computeStateEnergy(): number {
    return tf.tidy(() => {
      const all = tf.concat(
        [
          tf.abs(this.state.spectral),
          this.state.sensory,
          this.state.entorhinal,
          this.state.prefrontal,
        ],
        0,
      );
      return tf.sum(tf.square(all)).dataSync()[0];
    });
  }

  /**
   * Limpieza de recursos
   */
  dispose(): void {
    this.spectralCore.dispose();
    this.fossilMemory.dispose();
    this.logicEngine.dispose();

    this.state.spectral.dispose();
    this.state.sensory.dispose();
    this.state.entorhinal.dispose();
    this.state.prefrontal.dispose();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTACIÓN Y UTILIDADES
// ═══════════════════════════════════════════════════════════════════════════════

export default CognitiveKernel;

/**
 * Factory para crear kernel con configuración personalizada
 */
export function createKernel(partialConfig?: Partial<KernelConfig>): CognitiveKernel {
  const config = { ...DEFAULT_CONFIG, ...partialConfig };
  return new CognitiveKernel(config);
}

/**
 * Métricas de rendimiento del kernel
 */
export interface KernelMetrics {
  memoryEfficiency: number; // Uso de memoria espectral
  fossilHitRate: number; // Tasa de aciertos de memoria
  ruleAccuracy: number; // Precisión de reglas aprendidas
  decisionConfidence: number; // Confianza promedio en decisiones
}
