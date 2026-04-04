import { describe, it, expect, beforeEach } from "vitest";
import { SparseMetabolism } from "./sparse-metabolism.js";

describe("SparseMetabolism", () => {
  let metabolism: SparseMetabolism;

  beforeEach(() => {
    metabolism = new SparseMetabolism();
  });

  it("should activate all components when frustration is maximum", () => {
    const state = metabolism.computeMetabolism(1.0);
    expect(state.activatedComponents).toEqual([
      "neural_logic_engine",
      "hierarchical_memory",
      "autonomy_logger",
      "jepa_enhancer",
    ]);
    expect(state.skippedComponents).toContain("lyapunov_controller");
    expect(state.skippedComponents).toContain("causal_reasoner");
  });

  it("should skip high-threshold components when frustration is low", () => {
    const state = metabolism.computeMetabolism(0.1);
    // neural_logic_engine (0.0), autonomy_logger (0.0) should be active
    // jepa_enhancer (0.2), lyapunov_controller (0.3), hierarchical_memory (0.4), causal_reasoner (0.6) should be skipped
    expect(state.activatedComponents).toContain("neural_logic_engine");
    expect(state.activatedComponents).toContain("autonomy_logger");
    expect(state.skippedComponents).toContain("causal_reasoner");
    expect(state.skippedComponents).toContain("hierarchical_memory");
    expect(state.skippedComponents).toContain("lyapunov_controller");
    expect(state.skippedComponents).toContain("jepa_enhancer");
    expect(state.activatedComponents.length).toBe(2);
  });

  it("should strictly follow threshold boundaries", () => {
    // First sample seeds smoothing state.
    const low = metabolism.computeMetabolism(0.19);
    expect(low.activatedComponents).not.toContain("jepa_enhancer");

    const high = metabolism.computeMetabolism(0.5);
    expect(high.activatedComponents).toContain("jepa_enhancer");
  });

  it("should calculate non-zero activity for activated components", () => {
    const state = metabolism.computeMetabolism(0.5);
    for (const component of state.activatedComponents) {
      expect(state.componentActivities[component]).toBeGreaterThan(0);
    }
  });

  it("should correctly report trend in stats", () => {
    metabolism.computeMetabolism(0.1);
    metabolism.computeMetabolism(0.5);
    metabolism.computeMetabolism(0.9);
    const stats = metabolism.getStats();
    expect(stats.trend).toBeGreaterThan(0);
  });

  it("activates low-cost helpers on sharp frustration jumps before the smoothed signal fully catches up", () => {
    metabolism.computeMetabolism(0.15);
    const jump = metabolism.computeMetabolism(0.35);
    expect(jump.activatedComponents).toContain("jepa_enhancer");
    expect(jump.surprise).toBeGreaterThan(0.12);
  });
});
