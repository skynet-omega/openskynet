/**
 * COGNITIVE_KERNEL_V2.ts - Kernel Unificado Robusto
 *
 * Basado en la arqueología SOLITONES y la auditoría técnica.
 * Integra ToM, Ricci, Holograma y Langevin con un lifecycle de tensores endurecido.
 */

import * as tf from "@tensorflow/tfjs";

// ═══════════════════════════════════════════════════════════════════════════════
// TIPOS Y CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════════════════════

export interface KernelConfig {
  spectralDim: number;
  sensoryDim: number; // Debe ser >= hologramSize^2 para evitar padding negativo
  fossilCapacity: number;
  fossilThreshold: number;
  langevinStep: number;
  explorationTemp: number;
  hologramSize: number; // 30x30 = 900
  ricciScales: number[];
}

export const DEFAULT_CONFIG: KernelConfig = {
  spectralDim: 2048,
  sensoryDim: 1024, // Suficiente para 30x30=900
  fossilCapacity: 5000,
  fossilThreshold: 0.85,
  langevinStep: 0.01,
  explorationTemp: 1.0,
  hologramSize: 30,
  ricciScales: [3, 5, 7],
};

export interface CognitiveState {
  spectral: tf.Tensor;
  sensory: tf.Tensor;
  entorhinal: tf.Tensor;
  prefrontal: tf.Tensor;
  partnerModel: tf.Tensor;
  selfBelief: tf.Tensor;
  timestamp: number;
  surprise: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. HOLO-KOOPMAN SPECTRAL CORE
// ═══════════════════════════════════════════════════════════════════════════════

export class SpectralCore {
  private omega: tf.Tensor;
  private phaseLinear: tf.Tensor;

  constructor(private config: KernelConfig) {
    this.omega = tf.keep(tf.linspace(0.1, 0.1 * config.spectralDim, config.spectralDim));
    const phases = tf.linspace(0, 2 * Math.PI, config.spectralDim);
    this.phaseLinear = tf.keep(tf.complex(tf.cos(phases), tf.sin(phases)));
    console.log(`[SpectralCore] Initialized with dim ${config.spectralDim}`);
  }

  step(zOld: tf.Tensor, input: tf.Tensor): tf.Tensor {
    return tf.tidy(() => {
      const damping = 0.01;
      const rotation = tf.complex(
        tf.cos(this.omega).mul(Math.exp(-damping)),
        tf.sin(this.omega).mul(Math.exp(-damping)),
      );
      // zOld: [dim], rotation: [dim]
      const zRotated = tf.mul(zOld, rotation);

      // Proyectar input a complejo: [dim] -> [dim] complejo (vía padding si es necesario)
      // En V27, z es complejo [D]. El input u_t debe ser compatible.
      // Opción A: u_t es complejo [D] (requiere 2D input).
      // Opción B: u_t es real [D], proyectado a complex(u_t, 0).

      const inputResized = tf
        .pad(input, [[0, Math.max(0, this.config.spectralDim - input.shape[0])]])
        .slice([0], [this.config.spectralDim]);
      const uForced = tf.complex(inputResized, tf.zerosLike(inputResized));

      // result: [dim]
      const rotated = tf.mul(zRotated, this.phaseLinear);
      const nextZ = tf.add(rotated, uForced);
      return nextZ;
    });
  }

  dispose() {
    this.omega.dispose();
    this.phaseLinear.dispose();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. EPISODIC FOSSIL MEMORY
// ═══════════════════════════════════════════════════════════════════════════════

export interface Fossil {
  key: tf.Tensor;
  value: tf.Tensor;
}

export class FossilStore {
  private fossils: Fossil[] = [];

  constructor(private config: KernelConfig) {}

  store(state: CognitiveState): void {
    if (this.fossils.length >= this.config.fossilCapacity) {
      const r = this.fossils.shift();
      r?.key.dispose();
      r?.value.dispose();
    }
    const fossil: Fossil = {
      key: tf.keep(state.sensory.clone()),
      value: tf.keep(
        tf.concat([
          tf.real(state.spectral),
          tf.imag(state.spectral),
          state.entorhinal,
          state.prefrontal,
        ]),
      ),
    };
    this.fossils.push(fossil);
  }

  retrieve(query: tf.Tensor): tf.Tensor | null {
    return tf.tidy(() => {
      if (this.fossils.length === 0) return null;
      const sims = this.fossils.map((f) => {
        const dot = tf.sum(tf.mul(query, f.key));
        const norm = tf.mul(tf.norm(query), tf.norm(f.key));
        return tf.div(dot, norm.add(1e-6)).dataSync()[0];
      });
      const best = Math.max(...sims);
      if (best < this.config.fossilThreshold) return null;
      return this.fossils[sims.indexOf(best)].value.clone();
    });
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
// 3. RICCI & HOLOGRAMA (Geometría)
// ═══════════════════════════════════════════════════════════════════════════════

export class GeometryEngine {
  constructor(private config: KernelConfig) {}

  project(input: tf.Tensor): tf.Tensor {
    return tf.tidy(() => {
      const [h, w] = input.shape;
      const s = this.config.hologramSize;
      const padH = Math.max(0, s - h);
      const padW = Math.max(0, s - w);
      return tf
        .pad(input, [
          [Math.floor(padH / 2), Math.ceil(padH / 2)],
          [Math.floor(padW / 2), Math.ceil(padW / 2)],
        ])
        .slice([0, 0], [s, s]);
    });
  }

  ricciConsolidate(state: tf.Tensor, surprise: number): tf.Tensor {
    return tf.tidy(() => {
      // Placeholder: en V2 real se usaría convolución multiescala real
      const scale = surprise > 0.5 ? 0.9 : 1.1;
      return state.mul(scale);
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. SOCIAL MIRROR (ToM)
// ═══════════════════════════════════════════════════════════════════════════════

export class SocialMirror {
  private partnerW: tf.Tensor;

  constructor(private config: KernelConfig) {
    this.partnerW = tf.keep(tf.randomNormal([config.spectralDim, config.spectralDim]).mul(0.01));
  }

  mirror(self: tf.Tensor): tf.Tensor {
    return tf.tidy(() => {
      // z_partner = W * z_self (simulado en real para TFJS compat)
      // self puede venir como [dim] o [1, dim]. Forzar [dim, 1] para matMul.
      const selfFlat = self.flatten();
      const realSelf = tf.real(selfFlat).expandDims(1);
      const imagSelf = tf.imag(selfFlat).expandDims(1);

      // partnerW es [dim, dim]
      const realPartner = tf.matMul(this.partnerW, realSelf).flatten();
      const imagPartner = tf.matMul(this.partnerW, imagSelf).flatten();

      return tf.complex(realPartner, imagPartner);
    });
  }

  dispose() {
    this.partnerW.dispose();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// KERNEL V2 ENSAMBLADO
// ═══════════════════════════════════════════════════════════════════════════════

export class CognitiveKernelV2 {
  private spectral: SpectralCore;
  private fossils: FossilStore;
  private geometry: GeometryEngine;
  private social: SocialMirror;
  public state: CognitiveState;

  constructor(private config: KernelConfig = DEFAULT_CONFIG) {
    this.spectral = new SpectralCore(config);
    this.fossils = new FossilStore(config);
    this.geometry = new GeometryEngine(config);
    this.social = new SocialMirror(config);

    this.state = this.initState();
  }

  private initState(): CognitiveState {
    const d = this.config.spectralDim;
    return {
      spectral: tf.keep(tf.complex(tf.zeros([d]), tf.zeros([d]))),
      sensory: tf.keep(tf.zeros([this.config.sensoryDim])),
      entorhinal: tf.keep(tf.zeros([d])),
      prefrontal: tf.keep(tf.zeros([d])),
      partnerModel: tf.keep(tf.complex(tf.zeros([d]), tf.zeros([d]))),
      selfBelief: tf.keep(tf.zeros([d])),
      timestamp: Date.now(),
      surprise: 0,
    };
  }

  async perceive(input: tf.Tensor, partnerAction?: tf.Tensor): Promise<CognitiveState> {
    // Nota: El tidy() solo envuelve el cálculo de los NUEVOS tensores.
    // Los tensores que pasan al estado deben ser clonados y marcados con keep ANTES de salir del tidy.

    const { newSpectral, sensory, entorhinal, prefrontal, partnerModel, selfBelief, surprise } =
      tf.tidy(() => {
        // 1. Proyección Holográfica
        const proj = this.geometry.project(input).flatten();
        const sensory = tf
          .pad(proj, [[0, Math.max(0, this.config.sensoryDim - proj.shape[0])]])
          .slice([0], [this.config.sensoryDim]);

        // 2. Recuperación
        const recovered = this.fossils.retrieve(sensory);

        // 3. Evolución Espectral
        const newSpectral = this.spectral.step(this.state.spectral, sensory);

        // 4. Social & ToM
        const partnerModel = this.social.mirror(newSpectral);

        // 5. Ricci & Surprise
        const surprise = tf
          .mean(tf.square(tf.sub(tf.abs(newSpectral), tf.abs(this.state.spectral))))
          .dataSync()[0];
        const entorhinal = this.geometry.ricciConsolidate(this.state.entorhinal, surprise);
        const prefrontal = this.state.prefrontal.clone();
        const selfBelief = this.state.selfBelief.clone();

        // Devolvemos clones marcados para persistencia
        return {
          newSpectral: tf.keep(newSpectral.clone()),
          sensory: tf.keep(sensory.clone()),
          entorhinal: tf.keep(entorhinal.clone()),
          prefrontal: tf.keep(prefrontal),
          partnerModel: tf.keep(partnerModel.clone()),
          selfBelief: tf.keep(selfBelief),
          surprise,
        };
      });

    // 6. Ciclo de Vida: Limpiar estado anterior
    this.clearState();

    this.state = {
      spectral: newSpectral,
      sensory,
      entorhinal,
      prefrontal,
      partnerModel,
      selfBelief,
      timestamp: Date.now(),
      surprise,
    };

    if (surprise > 0.5) this.fossils.store(this.state);

    return this.state;
  }

  private clearState() {
    this.state.spectral.dispose();
    this.state.sensory.dispose();
    this.state.entorhinal.dispose();
    this.state.prefrontal.dispose();
    this.state.partnerModel.dispose();
    this.state.selfBelief.dispose();
  }

  dispose() {
    this.spectral.dispose();
    this.fossils.dispose();
    this.social.dispose();
    this.clearState();
  }
}
