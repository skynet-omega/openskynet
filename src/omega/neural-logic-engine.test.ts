import { describe, expect, it } from "vitest";
import { NeuralLogicEngine } from "./neural-logic-engine.js";

describe("NeuralLogicEngine", () => {
  it("produces deterministic inference for the same state and context", () => {
    const engineA = new NeuralLogicEngine();
    const engineB = new NeuralLogicEngine();
    const state = [0.85, 0.2, 0.4];
    const context = { frustration: 0.9, recentFailures: 4, successRate: 0.2 };

    const inferenceA = engineA.infer(state, context);
    const inferenceB = engineB.infer(state, context);

    expect(inferenceA.activeRules).toEqual(inferenceB.activeRules);
    expect(inferenceA.inferenceConfidence).toBe(inferenceB.inferenceConfidence);
    expect(inferenceA.logicalDelta).toEqual(inferenceB.logicalDelta);
    expect(inferenceA.stateAfter).toEqual(inferenceB.stateAfter);
  });

  it("pushes high-frustration low-success states toward recovery instead of reinforcing failure", () => {
    const engine = new NeuralLogicEngine();
    const current = [0.9, 0.15, 0.25];

    const inference = engine.infer(current, {
      frustration: 0.95,
      recentFailures: 5,
      successRate: 0.15,
    });

    expect(inference.activeRules.length).toBeGreaterThan(0);
    expect(inference.inferenceConfidence).toBeGreaterThan(0.1);
    expect(inference.stateAfter[1]).toBeGreaterThan(current[1]);
    expect(inference.stateAfter[2]).toBeLessThanOrEqual(0.8);
  });
});
