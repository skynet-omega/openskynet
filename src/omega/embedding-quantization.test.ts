import { describe, expect, it } from "vitest";
import { dequantizeEmbedding, quantizeNormalizedEmbedding } from "./embedding-quantization.js";
import { cosineSimilarity, createMemoryEmbedding } from "./memory-vectors.js";

describe("embedding quantization", () => {
  it("round-trips normalized embeddings with bounded cosine loss", () => {
    const embedding = createMemoryEmbedding({
      content: "preserve semantic similarity for holographic memory resonance",
      metadata: { area: "memory", mode: "experimental" },
    });
    const quantized = quantizeNormalizedEmbedding({ embedding, bits: 6 });

    expect(quantized).not.toBeNull();
    const restored = dequantizeEmbedding(quantized!);
    expect(restored).toHaveLength(embedding.length);
    expect(cosineSimilarity(embedding, restored)).toBeGreaterThan(0.92);
  });

  it("preserves top-1 semantic retrieval for most benchmark queries", () => {
    const corpus = [
      "stabilize telegram topic routing for forum threads",
      "compress semantic fossils with online vector quantization",
      "repair gateway session subscriptions for live transcript updates",
      "measure continuity drift across autonomous study cycles",
      "tighten ACP tool approval against spoofed hints",
      "propagate tool events from agent runtime into gateway observers",
      "restore robust config path resolution with legacy fallback",
      "track benchmark agreement between omega policy and kernel",
      "recover preview-finalized telegram hooks for observability",
      "preserve internal project focus across awakenings",
      "reduce world model blast radius by splitting synchronization phases",
      "record research hypotheses only when correlation crosses threshold",
    ].map((content, index) => ({
      id: `doc-${index}`,
      content,
      embedding: createMemoryEmbedding({ content, metadata: { area: "benchmark", index } }),
    }));

    const restoredCorpus = corpus.map((entry) => ({
      ...entry,
      restored:
        dequantizeEmbedding(
          quantizeNormalizedEmbedding({
            embedding: entry.embedding,
            bits: 6,
          })!,
        ) ?? entry.embedding,
    }));

    const queries = [
      "forum thread routing for telegram topics",
      "online vector quantization for memory fossils",
      "live transcript session subscription in gateway",
      "continuity drift in autonomous cycles",
      "tool approval spoofing in ACP",
      "gateway tool event observers",
      "legacy config path fallback",
      "omega versus kernel benchmark agreement",
      "telegram preview finalization observability",
      "focus continuity across awakenings",
      "split world model synchronization phases",
      "research correlation threshold for hypotheses",
    ];

    let matches = 0;
    for (let index = 0; index < queries.length; index += 1) {
      const queryEmbedding = createMemoryEmbedding({
        content: queries[index]!,
        metadata: { area: "benchmark-query", index },
      });
      const denseTop = corpus
        .map((entry) => ({
          id: entry.id,
          score: cosineSimilarity(queryEmbedding, entry.embedding),
        }))
        .sort((left, right) => right.score - left.score)[0];
      const quantizedTop = restoredCorpus
        .map((entry) => ({
          id: entry.id,
          score: cosineSimilarity(queryEmbedding, entry.restored),
        }))
        .sort((left, right) => right.score - left.score)[0];

      if (denseTop?.id === quantizedTop?.id) {
        matches += 1;
      }
    }

    expect(matches / queries.length).toBeGreaterThanOrEqual(0.83);
  });
});
