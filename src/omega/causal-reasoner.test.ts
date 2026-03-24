import { describe, expect, it } from "vitest";
import { CausalReasoner } from "./causal-reasoner.js";

describe("CausalReasoner", () => {
  it("builds stable causal links without duplicating graph structure across repeated observations", () => {
    const reasoner = new CausalReasoner();

    reasoner.observeCorrelation("action_recovery", "stability", "A→B");
    reasoner.observeCorrelation("action_recovery", "stability", "A→B");
    reasoner.observeCorrelation("action_recovery", "stability", "A→B");

    const plan = reasoner.reasonAboutIntervention("action_recovery");
    const stats = reasoner.getStats();

    expect(stats.edges).toBe(1);
    expect(plan.expectedEffects).toHaveLength(1);
    expect(plan.expectedEffects[0]?.variable).toBe("stability");
    expect(plan.expectedEffects[0]?.confidence).toBe(1);
  });

  it("propagates indirect effects with decaying confidence and surfaces backed confounders as backfire risk", () => {
    const reasoner = new CausalReasoner();

    reasoner.observeCorrelation("background_load", "action_recovery", "A→B");
    reasoner.observeCorrelation("background_load", "action_recovery", "A→B");
    reasoner.observeCorrelation("background_load", "action_recovery", "A→B");
    reasoner.observeCorrelation("action_recovery", "stability", "A→B");
    reasoner.observeCorrelation("action_recovery", "stability", "A→B");
    reasoner.observeCorrelation("action_recovery", "stability", "A→B");
    reasoner.observeCorrelation("stability", "throughput", "A→B");
    reasoner.observeCorrelation("stability", "throughput", "A→B");
    reasoner.observeCorrelation("stability", "throughput", "A→B");
    reasoner.detectConfounders();

    const plan = reasoner.reasonAboutIntervention("action_recovery");
    const direct = plan.expectedEffects.find((effect) => effect.variable === "stability");
    const indirect = plan.expectedEffects.find((effect) => effect.variable === "throughput");

    expect(direct?.confidence).toBe(1);
    expect(indirect?.confidence).toBeLessThan(0.8);
    expect(plan.potentialBackfires.some((risk) => risk.includes("background_load"))).toBe(true);
  });
});
