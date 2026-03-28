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

      // Proyectar input a complejo: [dim] -> [dim] complejo
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
  private ricciKernels: tf.Tensor[];

  constructor(private config: KernelConfig) {
    this.ricciKernels = this.config.ricciScales.map((size) => {
      return tf.tidy(() => {
        const center = (size - 1) / 2;
        const kernelArr = new Float32Array(size * size);
        for (let i = 0; i < size; i++) {
          for (let j = 0; j < size; j++) {
            const r = Math.sqrt(Math.pow(i - center, 2) + Math.pow(j - center, 2)) / center;
            kernelArr[i * size + j] = Math.exp(-Math.pow(r - 0.5, 2) / 0.05);
          }
        }
        return tf.keep(tf.tensor4d(kernelArr, [size, size, 1, 1]));
      });
    });
  }

  project(input: tf.Tensor): tf.Tensor {
    return tf.tidy(() => {
      let tensor = input;
      if (input.shape.length === 1) {
        const side = Math.floor(Math.sqrt(input.shape[0]));
        tensor = input.slice([0], [side * side]).reshape([side, side]);
      }
      const [h, w] = tensor.shape;
      const s = this.config.hologramSize;
      const padH = Math.max(0, s - h);
      const padW = Math.max(0, s - w);
      return tf
        .pad(tensor as tf.Tensor2D, [
          [Math.floor(padH / 2), Math.ceil(padH / 2)],
          [Math.floor(padW / 2), Math.ceil(padW / 2)],
        ])
        .slice([0, 0], [s, s]);
    });
  }

  ricciFlow(state: tf.Tensor, curvature: tf.Tensor): tf.Tensor {
    return tf.tidy(() => {
      const s = this.config.hologramSize;
      // Reducir estado a s*s si es más grande (ej. spectralDim)
      const stateFlattened = state.flatten();
      const stateResized = stateFlattened.slice([0], [s * s]).reshape([1, s, s, 1]);

      const weights = tf.softmax(curvature);
      const convs = this.ricciKernels.map((k, i) => {
        const c = tf.conv2d(stateResized as tf.Tensor4d, k as tf.Tensor4d, 1, "same");
        return c.mul(weights.slice([i % weights.shape[0]], [1]));
      });

      const mixed = tf.addN(convs);
      return mixed.flatten();
    });
  }

  dispose() {
    this.ricciKernels.forEach((k) => k.dispose());
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
      const selfFlat = self.flatten();
      const realSelf = tf.real(selfFlat).expandDims(1);
      const imagSelf = tf.imag(selfFlat).expandDims(1);

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
    const { newSpectral, sensory, entorhinal, prefrontal, partnerModel, selfBelief, surprise } =
      tf.tidy(() => {
        // 1. Proyección Holográfica
        const proj = this.geometry.project(input).flatten();
        const sensory = tf
          .pad(proj, [[0, Math.max(0, this.config.sensoryDim - proj.shape[0])]])
          .slice([0], [this.config.sensoryDim]);

        // 2. Recuperación
        const _recovered = this.fossils.retrieve(sensory);

        // 3. Evolución Espectral
        const newSpectral = this.spectral.step(this.state.spectral, sensory);

        // 4. Social & ToM
        const partnerModel = this.social.mirror(newSpectral);

        // 5. Ricci & Surprise
        const surprise = tf
          .mean(tf.square(tf.sub(tf.abs(newSpectral), tf.abs(this.state.spectral))))
          .dataSync()[0];

        // Curvatura Ricci basada en la energía local
        const curvature = tf.tensor1d([0.1, 0.2, surprise]);
        const entorhinalBase = this.geometry.ricciFlow(this.state.entorhinal, curvature);
        // Rescatar dimensiones para entorhinal (D)
        const entorhinal = tf
          .pad(entorhinalBase, [
            [0, Math.max(0, this.config.spectralDim - entorhinalBase.shape[0])],
          ])
          .slice([0], [this.config.spectralDim]);

        const prefrontal = this.state.prefrontal.clone();
        const selfBelief = partnerAction
          ? tf.sigmoid(tf.sub(partnerAction.flatten(), sensory.slice([0], [partnerAction.size])))
          : this.state.selfBelief.clone();

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
    this.geometry.dispose();
    this.social.dispose();
    this.clearState();
  }
}
