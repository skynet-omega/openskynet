import { describe, expect, it } from "vitest";
import { getOmegaHeartbeatEngineRegistry } from "./registry.js";

describe("omega heartbeat engine registry", () => {
  it("exposes the experimental engines through a stable registry surface", () => {
    const registry = getOmegaHeartbeatEngineRegistry();

    expect(registry.continuousThinking.id).toBe("continuous-thinking");
    expect(registry.entropyMinimization.id).toBe("entropy-minimization");
    expect(registry.activeLearning.id).toBe("active-learning");
    expect(registry.jepaEmpirical.id).toBe("jepa-empirical");
    expect(typeof registry.continuousThinking.think).toBe("function");
    expect(typeof registry.entropyMinimization.detectContradictions).toBe("function");
    expect(typeof registry.activeLearning.generateHypothesis).toBe("function");
    expect(typeof registry.jepaEmpirical.analyzeCorrelation).toBe("function");
    expect(typeof registry.collectKernelSignals).toBe("function");
    expect(typeof registry.testUntestedHypotheses).toBe("function");
  });
});
