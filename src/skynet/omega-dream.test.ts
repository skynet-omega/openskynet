import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HolographicMemoryManager } from "../omega/holographic-memory.js";
import { createMemoryEmbedding } from "../omega/memory-vectors.js";
import { OmegaDreamer } from "./omega-dream.js";

describe("OmegaDreamer", () => {
  let workspaceRoot = "";

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openskynet-dream-"));
  });

  afterEach(async () => {
    if (workspaceRoot) {
      await fs.rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("skips when there is not enough new memory pressure", async () => {
    const manager = new HolographicMemoryManager(workspaceRoot);
    await manager.initialize();
    await manager.fossilize(
      "single isolated fossil",
      { domain: "telegram" },
      createMemoryEmbedding({
        content: "single isolated fossil",
        metadata: { domain: "telegram" },
      }),
    );

    const dreamer = new OmegaDreamer(workspaceRoot, {
      minIntervalMs: 0,
      minNewFossils: 2,
      minClusterSize: 2,
    });
    const result = await dreamer.dream();

    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("not-enough-new-fossils");
  });

  it("consolidates clustered fossils into a synthetic dream memory", async () => {
    const manager = new HolographicMemoryManager(workspaceRoot);
    await manager.initialize();

    for (const content of [
      "Telegram audio in Spanish with Catalina voice",
      " telegram   audio in spanish with catalina voice ",
      "telegram audio in spanish with catalina voice",
      "Omega degraded components should stay visible",
      " omega   degraded components should stay visible ",
      "omega degraded components should stay visible",
    ]) {
      const normalized = content.trim().toLowerCase();
      const domain = normalized.startsWith("telegram") ? "telegram" : "omega";
      await manager.fossilize(
        content,
        { domain, importance: 1 },
        createMemoryEmbedding({
          content,
          metadata: { domain },
        }),
      );
    }

    const dreamer = new OmegaDreamer(workspaceRoot, {
      minIntervalMs: 0,
      minNewFossils: 2,
      minClusterSize: 2,
      similarityThreshold: 0.95,
      maxClustersPerRun: 4,
    });
    const result = await dreamer.dream();

    expect(result.status).toBe("success");
    expect((result.clusters ?? 0) >= 1).toBe(true);
    expect(result.consolidated >= 2).toBe(true);
    expect(result.wisdomGained[0]).toContain("[Dream synthesis]");

    const reloaded = new HolographicMemoryManager(workspaceRoot);
    await reloaded.initialize();
    const fossils = reloaded.getFossilsSnapshot();
    expect(
      fossils.some(
        (fossil) =>
          fossil.metadata?.source === "omega-dream" &&
          fossil.metadata?.synthetic === true &&
          typeof fossil.content === "string" &&
          fossil.content.includes("[Dream synthesis]"),
      ),
    ).toBe(true);

    const state = JSON.parse(
      await fs.readFile(
        path.join(workspaceRoot, ".openskynet", "skynet", "omega-dream-state.json"),
        "utf-8",
      ),
    ) as { lastDreamStatus?: string; lastDreamClusters?: number };
    expect(state.lastDreamStatus).toBe("success");
    expect((state.lastDreamClusters ?? 0) >= 1).toBe(true);
  });
});
