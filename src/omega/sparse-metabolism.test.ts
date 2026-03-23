import { describe, expect, it } from "vitest";
import { SparseMetabolism } from "./sparse-metabolism.js";

describe("SparseMetabolism", () => {
  it("activates more components and higher metabolic rate as frustration increases", () => {
    const metabolism = new SparseMetabolism();

    const low = metabolism.computeMetabolism(0.1);
    const medium = metabolism.computeMetabolism(0.5);
    const high = metabolism.computeMetabolism(0.9);

    expect(low.totalMetabolicRate).toBeLessThan(medium.totalMetabolicRate);
    expect(medium.totalMetabolicRate).toBeLessThan(high.totalMetabolicRate);
    expect(low.activatedComponents.length).toBeLessThanOrEqual(medium.activatedComponents.length);
    expect(medium.activatedComponents.length).toBeLessThanOrEqual(high.activatedComponents.length);
  });

  it("keeps critical control components enabled under high frustration", () => {
    const metabolism = new SparseMetabolism();
    const state = metabolism.computeMetabolism(0.9);

    expect(state.activatedComponents).toContain("lyapunov_controller");
    expect(state.activatedComponents).toContain("causal_reasoner");
    expect(state.activatedComponents).toContain("hierarchical_memory");
  });
});
