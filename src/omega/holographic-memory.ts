import fs from "node:fs/promises";
import path from "node:path";
import {
  dequantizeEmbedding,
  quantizeNormalizedEmbedding,
  type QuantizedEmbedding,
} from "./embedding-quantization.js";
import { cosineSimilarity, createMemoryEmbedding } from "./memory-vectors.js";
import { resolveOmegaLegacyStateFile, resolveOmegaStateFile } from "./paths.js";
import { OMEGA_MAX_MEMORY_RESONANCE_RESULTS, OMEGA_MEMORY_EMBEDDING_DIMENSIONS } from "./policy.js";

export interface SemanticFossil {
  id: number;
  content: string;
  metadata: Record<string, unknown>;
  embedding?: number[];
  quantizedEmbedding?: QuantizedEmbedding;
  createdAt: number;
}

export interface RedundantFossilCluster {
  ids: number[];
  fossils: SemanticFossil[];
  domain?: string;
  similarityFloor: number;
}

function resolveFossilEmbedding(fossil: SemanticFossil): number[] {
  if (Array.isArray(fossil.embedding) && fossil.embedding.length > 0) {
    return fossil.embedding;
  }
  if (fossil.quantizedEmbedding) {
    return dequantizeEmbedding(fossil.quantizedEmbedding);
  }
  return new Array(OMEGA_MEMORY_EMBEDDING_DIMENSIONS).fill(0);
}

function normalizeFossilContent(content: string): string {
  return content.trim().replace(/\s+/g, " ").toLowerCase();
}

function resolveFossilDomain(fossil: SemanticFossil): string | undefined {
  const raw = fossil.metadata?.domain;
  return typeof raw === "string" && raw.trim() ? raw.trim().toLowerCase() : undefined;
}

function truncateSummarySnippet(content: string, maxChars = 140): string {
  const normalized = content.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, maxChars - 1).trimEnd()}…`;
}

/**
 * Holographic Memory Manager (File-based JSON implementation for stability)
 * This maintains the API while avoiding native binary binding issues in this environment.
 */
export class HolographicMemoryManager {
  private fossils: SemanticFossil[] = [];
  private dbPath: string;
  private legacyDbPath: string;
  private workingMemory: number[] | null = null;
  private readonly ATTENTION_DECAY = 0.7; // Factor de retención de contexto previo

  constructor(workspacePath: string) {
    this.dbPath = resolveOmegaStateFile(workspacePath, "holographic-memory.json");
    this.legacyDbPath = resolveOmegaLegacyStateFile(workspacePath, "holographic-memory.json");
  }

  async initialize() {
    await fs.mkdir(path.dirname(this.dbPath), { recursive: true });
    try {
      const data = await fs.readFile(this.dbPath, "utf-8");
      this.fossils = JSON.parse(data);
    } catch {
      try {
        const legacyData = await fs.readFile(this.legacyDbPath, "utf-8");
        this.fossils = JSON.parse(legacyData);
        await this.save();
      } catch {
        this.fossils = [];
      }
    }
  }

  /**
   * Transduce a thought or outcome into a semantic fossil.
   */
  async fossilize(content: string, metadata: Record<string, unknown>, embedding?: number[]) {
    const resolvedEmbedding =
      embedding && embedding.length > 0
        ? embedding
        : createMemoryEmbedding({
            content,
            metadata,
            dimensions: OMEGA_MEMORY_EMBEDDING_DIMENSIONS,
          });
    const quantizedEmbedding = quantizeNormalizedEmbedding({
      embedding: resolvedEmbedding,
    });
    const fossil: SemanticFossil = {
      id: Date.now(),
      content,
      metadata,
      ...(quantizedEmbedding ? { quantizedEmbedding } : { embedding: resolvedEmbedding }),
      createdAt: Date.now(),
    };
    this.fossils.push(fossil);
    if (this.fossils.length > 2000) {
      this.fossils = this.fossils.slice(-2000);
    }
    await this.save();
    return fossil.id;
  }

  /**
   * Search past experiences that "resonate" with the current state.
   * Uses a focus-biased search to maintain context across multiple turns.
   */
  async resonance(queryEmbedding: number[], limit: number = 3) {
    // 1. Update Working Memory Focus (Moving Average)
    if (!this.workingMemory || this.workingMemory.length !== queryEmbedding.length) {
      this.workingMemory = [...queryEmbedding];
    } else {
      // Blend query with previous focus to maintain semantic continuity
      this.workingMemory = this.workingMemory.map(
        (v, i) => v * this.ATTENTION_DECAY + queryEmbedding[i] * (1 - this.ATTENTION_DECAY),
      );
    }

    const scored = this.fossils
      .map((fossil) => ({
        content: fossil.content,
        metadata: fossil.metadata,
        // Use the blended workingMemory for searching, not just the raw query
        distance: 1 - cosineSimilarity(this.workingMemory!, resolveFossilEmbedding(fossil)),
      }))
      .sort((left, right) => left.distance - right.distance);

    return scored.slice(0, Math.max(1, Math.min(limit, OMEGA_MAX_MEMORY_RESONANCE_RESULTS)));
  }

  async resonanceByText(
    content: string,
    metadata: Record<string, unknown> = {},
    limit: number = 3,
  ) {
    const queryEmbedding = createMemoryEmbedding({
      content,
      metadata,
      dimensions: OMEGA_MEMORY_EMBEDDING_DIMENSIONS,
    });
    return this.resonance(queryEmbedding, limit);
  }

  getFossilsSnapshot(limit?: number): SemanticFossil[] {
    const fossils =
      typeof limit === "number" && limit > 0
        ? this.fossils.slice(-Math.floor(limit))
        : this.fossils;
    return fossils.map((fossil) => ({
      ...fossil,
      metadata: { ...fossil.metadata },
      ...(Array.isArray(fossil.embedding) ? { embedding: [...fossil.embedding] } : {}),
      ...(fossil.quantizedEmbedding
        ? {
            quantizedEmbedding: {
              ...fossil.quantizedEmbedding,
              values: [...fossil.quantizedEmbedding.values],
            },
          }
        : {}),
    }));
  }

  findRedundantClusters(params?: {
    similarityThreshold?: number;
    minClusterSize?: number;
    sinceTimestamp?: number;
    maxClusterSpanMs?: number;
    sameDomainOnly?: boolean;
  }): RedundantFossilCluster[] {
    const similarityThreshold = params?.similarityThreshold ?? 0.94;
    const minClusterSize = Math.max(2, params?.minClusterSize ?? 2);
    const sinceTimestamp = params?.sinceTimestamp ?? 0;
    const maxClusterSpanMs = params?.maxClusterSpanMs ?? 12 * 60 * 60 * 1000;
    const sameDomainOnly = params?.sameDomainOnly ?? true;

    const candidates = this.fossils
      .filter((fossil) => fossil.createdAt >= sinceTimestamp)
      .sort((left, right) => left.createdAt - right.createdAt);

    const visited = new Set<number>();
    const clusters: RedundantFossilCluster[] = [];

    for (let i = 0; i < candidates.length; i += 1) {
      const seed = candidates[i];
      if (visited.has(seed.id)) {
        continue;
      }

      const seedDomain = resolveFossilDomain(seed);
      const seedEmbedding = resolveFossilEmbedding(seed);
      const seedContent = normalizeFossilContent(seed.content);
      const cluster: SemanticFossil[] = [seed];
      let similarityFloor = 1;

      for (let j = i + 1; j < candidates.length; j += 1) {
        const candidate = candidates[j];
        if (visited.has(candidate.id)) {
          continue;
        }
        if (candidate.createdAt - seed.createdAt > maxClusterSpanMs) {
          continue;
        }
        if (sameDomainOnly && resolveFossilDomain(candidate) !== seedDomain) {
          continue;
        }

        const candidateContent = normalizeFossilContent(candidate.content);
        const similarity =
          seedContent.length > 0 && seedContent === candidateContent
            ? 1
            : cosineSimilarity(seedEmbedding, resolveFossilEmbedding(candidate));

        if (similarity < similarityThreshold) {
          continue;
        }

        cluster.push(candidate);
        visited.add(candidate.id);
        similarityFloor = Math.min(similarityFloor, similarity);
      }

      if (cluster.length >= minClusterSize) {
        visited.add(seed.id);
        clusters.push({
          ids: cluster.map((fossil) => fossil.id),
          fossils: cluster,
          domain: seedDomain,
          similarityFloor,
        });
      }
    }

    return clusters;
  }

  async consolidateCluster(params: {
    cluster: RedundantFossilCluster;
    summary?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ summary: string; consolidatedCount: number }> {
    const clusterIds = new Set(params.cluster.ids);
    const snippets = params.cluster.fossils
      .map((fossil) => truncateSummarySnippet(fossil.content))
      .filter(Boolean)
      .slice(0, 3);
    const domainLabel = params.cluster.domain ? ` (${params.cluster.domain})` : "";
    const summary =
      params.summary?.trim() ||
      `[Dream synthesis${domainLabel}] ${params.cluster.fossils.length} fossils related to the same thread. Key signals: ${snippets.join(" | ")}`;
    const totalImportance = params.cluster.fossils.reduce((sum, fossil) => {
      const value = fossil.metadata?.importance;
      return typeof value === "number" && Number.isFinite(value) ? sum + value : sum;
    }, 0);

    this.fossils = this.fossils.filter((fossil) => !clusterIds.has(fossil.id));
    await this.fossilize(summary, {
      domain: params.cluster.domain ?? "omega-dream",
      synthetic: true,
      source: "omega-dream",
      consolidatedIds: params.cluster.ids,
      consolidatedCount: params.cluster.fossils.length,
      similarityFloor: params.cluster.similarityFloor,
      importance: totalImportance > 0 ? totalImportance : params.cluster.fossils.length,
      ...params.metadata,
    });

    return {
      summary,
      consolidatedCount: params.cluster.fossils.length,
    };
  }

  /**
   * Poda por Entropía: Elimina fósiles redundantes o de muy baja sorpresa (similitud alta).
   */
  async entropyPruning(threshold: number = 0.95): Promise<{ pruned: number }> {
    if (this.fossils.length < 2) {
      return { pruned: 0 };
    }

    const clusters = this.findRedundantClusters({
      similarityThreshold: threshold,
      minClusterSize: 2,
      maxClusterSpanMs: 6 * 60 * 60 * 1000,
      sameDomainOnly: true,
    });
    if (clusters.length === 0) {
      return { pruned: 0 };
    }

    const prunedIds = new Set<number>();
    for (const cluster of clusters) {
      for (const fossil of cluster.fossils.slice(1)) {
        prunedIds.add(fossil.id);
      }
    }

    if (prunedIds.size === 0) {
      return { pruned: 0 };
    }

    this.fossils = this.fossils.filter((fossil) => !prunedIds.has(fossil.id));
    await this.save();

    return { pruned: prunedIds.size };
  }

  /**
   * Reset current semantic focus. Call when starting a new unrelated task.
   */
  resetFocus() {
    this.workingMemory = null;
  }

  private async save() {
    await fs.writeFile(this.dbPath, JSON.stringify(this.fossils, null, 2));
  }

  close() {
    // No-op for file-based
  }
}
