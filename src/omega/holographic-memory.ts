import fs from "node:fs/promises";
import path from "node:path";
import { cosineSimilarity, createMemoryEmbedding } from "./memory-vectors.js";
import { resolveOmegaLegacyStateFile, resolveOmegaStateFile } from "./paths.js";
import { OMEGA_MAX_MEMORY_RESONANCE_RESULTS, OMEGA_MEMORY_EMBEDDING_DIMENSIONS } from "./policy.js";

export interface SemanticFossil {
  id: number;
  content: string;
  metadata: Record<string, unknown>;
  embedding: number[];
  createdAt: number;
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
    const fossil: SemanticFossil = {
      id: Date.now(),
      content,
      metadata,
      embedding:
        embedding && embedding.length > 0
          ? embedding
          : createMemoryEmbedding({
              content,
              metadata,
              dimensions: OMEGA_MEMORY_EMBEDDING_DIMENSIONS,
            }),
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
        distance: 1 - cosineSimilarity(this.workingMemory!, fossil.embedding),
      }))
      .sort((left, right) => left.distance - right.distance);

    return scored.slice(0, Math.max(1, Math.min(limit, OMEGA_MAX_MEMORY_RESONANCE_RESULTS)));
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
