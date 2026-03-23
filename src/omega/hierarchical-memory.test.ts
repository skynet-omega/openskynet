import { describe, expect, it } from "vitest";
import { HierarchicalMemory } from "./hierarchical-memory.js";

describe("HierarchicalMemory", () => {
  it("consolidates repeated drive episodes into a stable semantic concept instead of duplicating concepts", () => {
    const memory = new HierarchicalMemory();

    memory.addEpisode([0.9, 0.2, 0.8], 0.8, "recovery", "failure", 1, { reward: 0.2 });
    memory.addEpisode([0.85, 0.25, 0.75], 0.7, "recovery", "failure", 2, { reward: 0.3 });
    memory.addEpisode([0.8, 0.3, 0.7], 0.6, "recovery", "success", 3, { reward: 0.9 });

    const conceptsAfterFirstWave = memory.getSemanticConcepts();
    expect(conceptsAfterFirstWave).toHaveLength(1);
    expect(conceptsAfterFirstWave[0]?.id).toBe("semantic_recovery");
    expect(conceptsAfterFirstWave[0]?.frequency).toBe(3);

    memory.addEpisode([0.75, 0.35, 0.65], 0.55, "recovery", "success", 4, { reward: 0.8 });
    memory.addEpisode([0.7, 0.4, 0.6], 0.5, "recovery", "success", 5, { reward: 0.85 });
    memory.addEpisode([0.72, 0.38, 0.62], 0.52, "recovery", "success", 6, { reward: 0.88 });

    const conceptsAfterSecondWave = memory.getSemanticConcepts();
    expect(conceptsAfterSecondWave).toHaveLength(1);
    expect(conceptsAfterSecondWave[0]?.frequency).toBe(6);
    expect(conceptsAfterSecondWave[0]?.avgReward).toBeGreaterThan(0.6);
    expect(conceptsAfterSecondWave[0]?.rule).toContain("dominant outcome=success");
  });

  it("retrieves episodic context by similarity and procedural recovery guidance together", () => {
    const memory = new HierarchicalMemory();

    memory.addToWorking({
      content: {
        driveKind: "recovery",
        frustration: 0.9,
        successRate: 0.2,
        action: "retry",
      },
    });
    memory.addEpisode([0.95, 0.15, 0.9], 0.9, "recovery", "failure", 1, { reward: 0.1 });
    memory.addEpisode([0.9, 0.2, 0.85], 0.85, "recovery", "failure", 2, { reward: 0.15 });
    memory.addEpisode([0.88, 0.22, 0.82], 0.8, "recovery", "success", 3, { reward: 0.7 });

    const context = memory.retrieveRelevantContext(
      [0.92, 0.18, 0.88],
      "error recovery after repeated failures",
    );

    expect(context.working).toHaveLength(1);
    expect(context.episodic[0]?.driveKind).toBe("recovery");
    expect(context.semantic.some((concept) => concept.id === "semantic_recovery")).toBe(true);
    expect(context.procedural.some((skill) => skill.name === "error_recovery")).toBe(true);
  });
});
