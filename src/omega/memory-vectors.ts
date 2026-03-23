import { OMEGA_MEMORY_EMBEDDING_DIMENSIONS } from "./policy.js";

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalize(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) {
    return vector;
  }
  return vector.map((value) => value / magnitude);
}

export function createTextEmbedding(
  text: string,
  dimensions: number = OMEGA_MEMORY_EMBEDDING_DIMENSIONS,
): number[] {
  const vector = new Array(dimensions).fill(0);
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9_]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  for (const token of tokens) {
    const hash = stableHash(token);
    const slot = hash % dimensions;
    const sign = (hash & 1) === 0 ? 1 : -1;
    vector[slot] += sign * (1 + (token.length % 7) * 0.1);
  }

  return normalize(vector);
}

export function createMemoryEmbedding(params: {
  content: string;
  metadata?: Record<string, unknown>;
  dimensions?: number;
}): number[] {
  const metadataText = params.metadata ? JSON.stringify(params.metadata) : "";
  return createTextEmbedding(`${params.content}\n${metadataText}`, params.dimensions);
}

export function cosineSimilarity(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  if (length === 0) {
    return 0;
  }
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftNorm += leftValue * leftValue;
    rightNorm += rightValue * rightValue;
  }
  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }
  return dot / Math.sqrt(leftNorm * rightNorm);
}
