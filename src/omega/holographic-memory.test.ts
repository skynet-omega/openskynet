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
});
