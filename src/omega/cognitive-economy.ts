import fs from "node:fs/promises";
import path from "node:path";

export type ViabilityFeatureVector = [number, number, number, number];

export class GoalViabilityEngine {
  weights: number[];
  bias: number;
  learningRate: number;
  private statePath: string;

  constructor(workspaceRoot: string, numFeatures: number = 4) {
    this.weights = new Array(numFeatures).fill(0);
    this.bias = 0;
    this.learningRate = 0.1;
    this.statePath = path.join(workspaceRoot, ".openskynet", "goal-viability-weights.json");
  }

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.statePath, "utf-8");
      const state = JSON.parse(raw);
      if (Array.isArray(state.weights)) this.weights = state.weights;
      if (typeof state.bias === "number") this.bias = state.bias;
    } catch {
      // Start from scratch if no file exists
    }
  }

  async save(): Promise<void> {
    await fs.mkdir(path.dirname(this.statePath), { recursive: true }).catch(() => {});
    await fs.writeFile(
      this.statePath,
      JSON.stringify({
        weights: this.weights,
        bias: this.bias,
      }),
      "utf-8",
    );
  }

  predict(features: ViabilityFeatureVector): number {
    let sum = this.bias;
    for (let i = 0; i < features.length; i++) {
      sum += features[i] * this.weights[i];
    }
    return 1 / (1 + Math.exp(-sum)); // Sigmoid - Probability of goal being VIABLE
  }

  async update(features: ViabilityFeatureVector, actualOutcome: number): Promise<void> {
    const predictedOutcome = this.predict(features);
    const error = actualOutcome - predictedOutcome;

    for (let i = 0; i < features.length; i++) {
      this.weights[i] += this.learningRate * error * features[i];
    }
    this.bias += this.learningRate * error;

    await this.save();
  }
}
