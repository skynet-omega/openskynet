import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HolographicMemoryManager } from "./holographic-memory.js";
import { createMemoryEmbedding } from "./memory-vectors.js";

describe("HolographicMemoryManager", () => {
  let workspaceRoot = "";

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openskynet-holo-"));
  });

  afterEach(async () => {
    if (workspaceRoot) {
      await fs.rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("orders resonance results by deterministic similarity instead of recency", async () => {
    const manager = new HolographicMemoryManager(workspaceRoot);
    await manager.initialize();

    await manager.fossilize(
      "stabilize heartbeat runner and recovery path",
      { area: "heartbeat" },
      createMemoryEmbedding({
        content: "stabilize heartbeat runner and recovery path",
        metadata: { area: "heartbeat" },
      }),
    );
    await manager.fossilize(
      "improve semantic memory retrieval for fossils",
      { area: "memory" },
      createMemoryEmbedding({
        content: "improve semantic memory retrieval for fossils",
        metadata: { area: "memory" },
      }),
    );

    const query = createMemoryEmbedding({
      content: "memory retrieval and fossil search",
      metadata: { area: "memory" },
    });
    const resonances = await manager.resonance(query, 2);

    expect(resonances).toHaveLength(2);
    expect(resonances[0]?.metadata).toMatchObject({ area: "memory" });
    expect(resonances[0]?.distance).toBeLessThanOrEqual(resonances[1]?.distance ?? 1);
  });

  it("persists quantized embeddings for new fossils while keeping resonance functional", async () => {
    const manager = new HolographicMemoryManager(workspaceRoot);
    await manager.initialize();

    await manager.fossilize(
      "compress semantic fossils with online vector quantization",
      { area: "memory", compression: "turboquant-lite" },
      createMemoryEmbedding({
        content: "compress semantic fossils with online vector quantization",
        metadata: { area: "memory", compression: "turboquant-lite" },
      }),
    );

    const persisted = JSON.parse(
      await fs.readFile(
        path.join(workspaceRoot, ".openskynet", "holographic-memory.json"),
        "utf-8",
      ),
    ) as Array<Record<string, unknown>>;
    expect(persisted[0]?.quantizedEmbedding).toMatchObject({
      scheme: "turboquant-lite-v1",
      bits: 6,
    });
    expect(Array.isArray((persisted[0]?.quantizedEmbedding as { values?: unknown })?.values)).toBe(
      true,
    );

    const resonances = await manager.resonance(
      createMemoryEmbedding({
        content: "online vector quantization for semantic memory",
        metadata: { area: "memory" },
      }),
      1,
    );
    expect(resonances).toHaveLength(1);
    expect(resonances[0]?.metadata).toMatchObject({ compression: "turboquant-lite" });
  });
});
