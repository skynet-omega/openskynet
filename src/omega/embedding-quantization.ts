import { OMEGA_MEMORY_EMBEDDING_DIMENSIONS } from "./policy.js";

export type QuantizedEmbedding = {
  scheme: "turboquant-lite-v1";
  dimensions: number;
  bits: number;
  scale: number;
  values: number[];
};

const DEFAULT_BITS = 6;
const MIN_BITS = 2;
const MAX_BITS = 8;

function isPowerOfTwo(value: number): boolean {
  return value > 0 && (value & (value - 1)) === 0;
}

function normalize(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) {
    return vector.map(() => 0);
  }
  return vector.map((value) => value / magnitude);
}

function resolveBitWidth(bits?: number): number {
  const candidate =
    typeof bits === "number" && Number.isFinite(bits) ? Math.round(bits) : DEFAULT_BITS;
  return Math.max(MIN_BITS, Math.min(MAX_BITS, candidate));
}

function signMask(index: number): number {
  let x = (index + 1) * 0x45d9f3b;
  x ^= x >>> 16;
  return (x & 1) === 0 ? 1 : -1;
}

function applySignScramble(vector: number[]): number[] {
  return vector.map((value, index) => value * signMask(index));
}

function fastWalshHadamard(vector: number[]): number[] {
  const out = [...vector];
  for (let len = 1; len < out.length; len <<= 1) {
    for (let start = 0; start < out.length; start += len << 1) {
      for (let offset = 0; offset < len; offset += 1) {
        const left = out[start + offset] ?? 0;
        const right = out[start + len + offset] ?? 0;
        out[start + offset] = left + right;
        out[start + len + offset] = left - right;
      }
    }
  }
  const norm = Math.sqrt(out.length);
  return out.map((value) => value / norm);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function quantizeScalar(value: number, bits: number, scale: number): number {
  const levels = (1 << bits) - 1;
  const normalized = clamp((value + scale) / (2 * scale), 0, 1);
  return Math.round(normalized * levels);
}

function dequantizeScalar(value: number, bits: number, scale: number): number {
  const levels = (1 << bits) - 1;
  const normalized = clamp(value / levels, 0, 1);
  return normalized * 2 * scale - scale;
}

export function quantizeNormalizedEmbedding(params: {
  embedding: number[];
  bits?: number;
}): QuantizedEmbedding | null {
  const embedding = normalize(params.embedding);
  if (
    embedding.length === 0 ||
    embedding.length !== OMEGA_MEMORY_EMBEDDING_DIMENSIONS ||
    !isPowerOfTwo(embedding.length)
  ) {
    return null;
  }
  const bits = resolveBitWidth(params.bits);
  const rotated = fastWalshHadamard(applySignScramble(embedding));
  const scale = Math.max(1e-6, ...rotated.map((value) => Math.abs(value)));
  return {
    scheme: "turboquant-lite-v1",
    dimensions: embedding.length,
    bits,
    scale,
    values: rotated.map((value) => quantizeScalar(value, bits, scale)),
  };
}

export function dequantizeEmbedding(quantized: QuantizedEmbedding): number[] {
  if (
    quantized.scheme !== "turboquant-lite-v1" ||
    quantized.dimensions <= 0 ||
    !isPowerOfTwo(quantized.dimensions)
  ) {
    return [];
  }
  const rotated = quantized.values.map((value) =>
    dequantizeScalar(value, resolveBitWidth(quantized.bits), quantized.scale),
  );
  return normalize(applySignScramble(fastWalshHadamard(rotated)));
}
