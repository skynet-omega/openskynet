/**
 * COGNITIVE_KERNEL_MIN.ts - MVK (Minimum Viable Kernel)
 *
 * Basado en la auditoría técnica del 2026-03-28.
 * Reduce la complejidad para asegurar ejecutabilidad y validación de Fase C.
 *
 * Incluye únicamente:
 * 1. SpectralCore (Holo-Koopman V27)
 * 2. FossilMemoryStore (CORE_X)
 * 3. LangevinDecision (V304)
 */

import * as tf from "@tensorflow/tfjs";

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN Y TIPOS
// ═══════════════════════════════════════════════════════════════════════════════

export interface KernelConfig {
  spectralDim: number; // Dimensión del espacio de Hilbert complejo
  fossilCapacity: number; // Cantidad máxima de fósiles
  fossilThreshold: number; // Similitud mínima para recuperación (0.85 en X)
  langevinStep: number; // Paso de la dinámica de Langevin
  explorationTemp: number; // Temperatura para el muestreo de Gibbs
}

export const DEFAULT_CONFIG: KernelConfig = {
  spectralDim: 256,
  fossilCapacity: 500,
  fossilThreshold: 0.85,
  langevinStep: 0.01,
  explorationTemp: 1.0,
};

export interface CognitiveState {
  spectral: tf.Tensor; // Complejo [spectralDim]
  sensory: tf.Tensor; // Real [spectralDim]
  timestamp: number;
  surprise: number;
}

export interface Fossil {
  key: tf.Tensor; // Real [spectralDim] (embedding sensorial)
  value: tf.Tensor; // Real [spectralDim * 3] (Concat: spectral.real, spectral.imag, sensory)
  accessCount: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. SPECTRAL CORE (Holo-Koopman)
// ═══════════════════════════════════════════════════════════════════════════════

export class SpectralCore {
  private omega: tf.Tensor;
  private damping: number = 0.01;

  constructor(private config: KernelConfig) {
    // Inicializar frecuencias propias (Reloj interno de V27)
    this.omega = tf.linspace(0.1, 0.1 * config.spectralDim, config.spectralDim);
  }

  /**
   * Evolución: z_new = z_old * exp(i*omega - damping) + u_t
   */
  step(zOld: tf.Tensor, u: tf.Tensor): tf.Tensor {
    return tf.tidy(() => {
      // Operador de rotación unitaria
      const rotation = tf.complex(
        tf.cos(this.omega).mul(Math.exp(-this.damping)),
        tf.sin(this.omega).mul(Math.exp(-this.damping)),
      );

      // Proyectar input real a complejo (Simetría V27)
      // Usamos el input como forzamiento real, imag=0
      const forcing = tf.complex(u, tf.zerosLike(u));

      return tf.add(tf.mul(zOld, rotation), forcing);
    });
  }

  dispose() {
    this.omega.dispose();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. FOSSIL MEMORY STORE (CORE_X)
// ═══════════════════════════════════════════════════════════════════════════════

export class FossilMemoryStore {
  private fossils: Fossil[] = [];

  constructor(private config: KernelConfig) {}

  /**
   * Guarda el estado actual como un fósil
   */
  store(state: CognitiveState): void {
    if (this.fossils.length >= this.config.fossilCapacity) {
      const removed = this.fossils.shift();
      removed?.key.dispose();
      removed?.value.dispose();
    }

    const fossil: Fossil = {
      // Estos tensores deben sobrevivir al tidy del ciclo de percepción.
      key: tf.keep(state.sensory.clone()),
      value: tf.keep(tf.concat([tf.real(state.spectral), tf.imag(state.spectral), state.sensory])),
      accessCount: 0,
    };
    this.fossils.push(fossil);
  }

  /**
   * Recupera y devuelve una propuesta de rehidratación
   */
  retrieve(query: tf.Tensor): { spectral?: tf.Tensor; sensory?: tf.Tensor } | null {
    return tf.tidy(() => {
      if (this.fossils.length === 0) return null;

      // Calcular similitudes (Query/Key match)
      const similarities = this.fossils.map((f) => {
        const dot = tf.sum(tf.mul(query, f.key));
        const norm = tf.mul(tf.norm(query), tf.norm(f.key));
        return tf.div(dot, norm.add(1e-6)).dataSync()[0];
      });

      const bestIdx = similarities.indexOf(Math.max(...similarities));

      if (similarities[bestIdx] < this.config.fossilThreshold) return null;

      const f = this.fossils[bestIdx];
      f.accessCount++;

      // Partir el valor guardado
      const d = this.config.spectralDim;
      const val = f.value;

      return {
        spectral: tf.complex(val.slice([0], [d]), val.slice([d], [d])),
        sensory: val.slice([d * 2], [d]),
      };
    });
  }

  hasMatch(query: tf.Tensor): boolean {
    return tf.tidy(() => {
      if (this.fossils.length === 0) return false;

      const similarities = this.fossils.map((f) => {
        const dot = tf.sum(tf.mul(query, f.key));
        const norm = tf.mul(tf.norm(query), tf.norm(f.key));
        return tf.div(dot, norm.add(1e-6)).dataSync()[0];
      });

      return Math.max(...similarities) >= this.config.fossilThreshold;
    });
  }

  getCount(): number {
    return this.fossils.length;
  }

  dispose() {
    this.fossils.forEach((f) => {
      f.key.dispose();
      f.value.dispose();
    });
    this.fossils = [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. LANGEVIN DECISION (V304)
// ═══════════════════════════════════════════════════════════════════════════════

export class LangevinDecision {
  constructor(private config: KernelConfig) {}

  decide(candidates: tf.Tensor[], currentEnergy: number): tf.Tensor {
    return tf.tidy(() => {
      const energies = candidates.map((c) => {
        // Energía = Desajuste entre la energía del candidato y el nivel actual (V304)
        const candidateEnergy = tf.sum(tf.square(c)).dataSync()[0];
        return Math.abs(candidateEnergy - currentEnergy);
      });

      const minE = Math.min(...energies);
      const weights = energies.map((e) => Math.exp(-(e - minE) / this.config.explorationTemp));
      const sumW = weights.reduce((a, b) => a + b, 0);
      const probs = weights.map((w) => w / sumW);

      // Muestreo de Gibbs (Relajación)
      const r = Math.random();
      let acc = 0;
      for (let i = 0; i < candidates.length; i++) {
        acc += probs[i];
        if (r < acc) return candidates[i];
      }
      return candidates[candidates.length - 1];
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// KERNEL MÍNIMO ENSAMBLADO
// ═══════════════════════════════════════════════════════════════════════════════

export class CognitiveKernelMin {
  private spectralCore: SpectralCore;
  private fossilStore: FossilMemoryStore;
  private decision: LangevinDecision;

  public state: CognitiveState;

  constructor(private config: KernelConfig = DEFAULT_CONFIG) {
    this.spectralCore = new SpectralCore(config);
    this.fossilStore = new FossilMemoryStore(config);
    this.decision = new LangevinDecision(config);

    this.state = {
      spectral: tf.complex(tf.zeros([config.spectralDim]), tf.zeros([config.spectralDim])),
      sensory: tf.zeros([config.spectralDim]),
      timestamp: Date.now(),
      surprise: 0,
    };
  }

  /**
   * Ciclo de percepción corregido
   */
  async perceive(input: tf.Tensor): Promise<CognitiveState> {
    return tf.tidy(() => {
      // 1. Procesamiento sensorial: asegurar dimensiones [spectralDim]
      const sensory = this.preprocess(input);

      // 2. Intento de rehidratación (CORE_X)
      const recovery = this.fossilStore.retrieve(sensory);
      const baseSpectral = recovery?.spectral || this.state.spectral;

      // 3. Evolución espectral (V27)
      const newSpectral = this.spectralCore.step(baseSpectral, sensory);

      // 4. Medir sorpresa (JEPA logic)
      const surprise = tf
        .mean(tf.square(tf.sub(tf.abs(newSpectral), tf.abs(this.state.spectral))))
        .dataSync()[0];

      // 5. Consolidación selectiva
      if (surprise > 0.5) {
        this.fossilStore.store(this.state);
      }

      // 6. Actualizar estado (Liberar estado anterior para evitar fugas)
      this.state.spectral.dispose();
      this.state.sensory.dispose();

      this.state = {
        spectral: newSpectral.clone(),
        sensory: sensory.clone(),
        timestamp: Date.now(),
        surprise,
      };

      return this.state;
    });
  }

  /**
   * Decisión por dinámica de Langevin (V304)
   * Selecciona el candidato que minimiza la tensión con el estado actual
   */
  decide(candidates: tf.Tensor[]): tf.Tensor {
    return tf.tidy(() => {
      // Energía del estado actual: norma L2 del vector espectral
      const currentEnergy = tf.sum(tf.square(tf.abs(this.state.spectral))).dataSync()[0];
      return this.decision.decide(candidates, currentEnergy);
    });
  }

  getStats(): { fossilCount: number; surprise: number; timestamp: number } {
    return {
      fossilCount: this.fossilStore.getCount(),
      surprise: this.state.surprise,
      timestamp: this.state.timestamp,
    };
  }

  canRecover(input: tf.Tensor): boolean {
    return tf.tidy(() => this.fossilStore.hasMatch(this.preprocess(input)));
  }

  private preprocess(input: tf.Tensor): tf.Tensor {
    return tf.tidy(() => {
      const flat = input.flatten();
      const dim = this.config.spectralDim;
      if (flat.shape[0] === dim) return flat;
      if (flat.shape[0] > dim) return flat.slice([0], [dim]);
      return tf.pad(flat, [[0, dim - flat.shape[0]]]);
    });
  }

  dispose() {
    this.spectralCore.dispose();
    this.fossilStore.dispose();
    this.state.spectral.dispose();
    this.state.sensory.dispose();
  }
}
