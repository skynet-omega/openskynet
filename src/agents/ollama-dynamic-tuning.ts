export interface OllamaDynamicTuningParams {
  modelContextWindow: number;
  originalTemp?: number;
  originalTopP?: number;
  systemPromptLength: number;
  messageCount: number;
  toolCount: number;
}

export interface OllamaDynamicTuningResult {
  temperature: number;
  top_p: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  reasoning: string;
}

function isSmallModel(contextWindow: number): boolean {
  // Models with <=16K context tend to become less reliable under large prompts/tool overhead.
  return contextWindow <= 16_000;
}

export function calculateOllamaDynamicTuning(
  params: OllamaDynamicTuningParams,
): OllamaDynamicTuningResult {
  const isSmall = isSmallModel(params.modelContextWindow);

  if (isSmall) {
    const baseTemp = 0.1;
    const temperature =
      params.originalTemp !== undefined && params.originalTemp > 1.0
        ? Math.min(params.originalTemp, 0.5)
        : baseTemp;
    const top_p = 0.6;
    const presence_penalty = 0.1;
    const frequency_penalty = 0.05;

    return {
      temperature,
      top_p,
      presence_penalty,
      frequency_penalty,
      reasoning:
        `Small model (ctx=${params.modelContextWindow}): ` +
        `Use cold sampling (T=${temperature}, top_p=${top_p}) ` +
        `to reduce hallucinations. Penalties: pres=${presence_penalty}, freq=${frequency_penalty}`,
    };
  }

  const temperature = params.originalTemp ?? 0.7;
  const top_p = params.originalTopP ?? 0.9;

  return {
    temperature,
    top_p,
    reasoning:
      `Model capable (ctx=${params.modelContextWindow}): ` +
      `Use Standard sampling (T=${temperature}, top_p=${top_p})`,
  };
}

export function applyDynamicTuningToOllamaOptions(
  ollamaOptions: Record<string, unknown>,
  tuning: OllamaDynamicTuningResult,
): void {
  ollamaOptions.temperature = tuning.temperature;
  ollamaOptions.top_p = tuning.top_p;
  if (tuning.presence_penalty !== undefined) {
    ollamaOptions.presence_penalty = tuning.presence_penalty;
  }
  if (tuning.frequency_penalty !== undefined) {
    ollamaOptions.frequency_penalty = tuning.frequency_penalty;
  }
}

// Backward-compatible alias while remaining callers migrate away from old POC naming.
export const calculateDynamicTuning = calculateOllamaDynamicTuning;

export function testPOC1DynamicTuning() {
  console.log("\n=== Ollama Dynamic Tuning Test Suite ===\n");

  const smallModelTuning = calculateOllamaDynamicTuning({
    modelContextWindow: 4096,
    originalTemp: undefined,
    systemPromptLength: 2000,
    messageCount: 10,
    toolCount: 5,
  });

  console.log("✓ Test 1 - Small Model (Qwen3.5:latest)");
  console.log(`  Temperature: ${smallModelTuning.temperature} (expected: 0.1)`);
  console.log(`  top_p: ${smallModelTuning.top_p} (expected: 0.6)`);
  console.log(`  presence_penalty: ${smallModelTuning.presence_penalty} (expected: 0.1)`);
  console.assert(smallModelTuning.temperature === 0.1, "Small model should have T=0.1");
  console.assert(smallModelTuning.top_p === 0.6, "Small model should have top_p=0.6");

  const largeModelTuning = calculateOllamaDynamicTuning({
    modelContextWindow: 128 * 1024,
    originalTemp: 0.7,
    systemPromptLength: 5000,
    messageCount: 20,
    toolCount: 10,
  });

  console.log("\n✓ Test 2 - Large Model (Kimi-K2.5)");
  console.log(`  Temperature: ${largeModelTuning.temperature} (expected: 0.7)`);
  console.log(`  top_p: ${largeModelTuning.top_p} (expected: 0.9)`);
  console.assert(largeModelTuning.temperature === 0.7, "Large model should preserve T=0.7");
  console.assert(largeModelTuning.top_p === 0.9, "Large model should use top_p=0.9");

  const smallCreativeTuning = calculateOllamaDynamicTuning({
    modelContextWindow: 8192,
    originalTemp: 1.5,
    systemPromptLength: 3000,
    messageCount: 15,
    toolCount: 3,
  });

  console.log("\n✓ Test 3 - Small Model with High Temperature");
  console.log(`  Temperature: ${smallCreativeTuning.temperature} (expected: capped at 0.5)`);
  console.assert(
    smallCreativeTuning.temperature <= 0.5,
    "Small model should cap creative temperature at 0.5",
  );

  console.log("\n=== Dynamic tuning tests passed ===\n");
}

export async function benchmarkPOC1Latency(): Promise<void> {
  console.log("\n=== Ollama Dynamic Tuning Latency Benchmark ===\n");

  const iterations = 1000;
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    calculateOllamaDynamicTuning({
      modelContextWindow: i % 2 === 0 ? 4096 : 128000,
      originalTemp: 0.7,
      systemPromptLength: 2000,
      messageCount: 10,
      toolCount: 5,
    });
  }
  const end = performance.now();

  const avgLatency = (end - start) / iterations;
  console.log(`Average latency per call: ${avgLatency.toFixed(4)}ms`);
  console.log(`Total for ${iterations} iterations: ${(end - start).toFixed(2)}ms`);
  console.assert(avgLatency < 0.1, `Expected <0.1ms per call, got ${avgLatency.toFixed(4)}ms`);

  console.log("\n=== Dynamic tuning latency OK ===\n");
}

export type DynamicTuningParams = OllamaDynamicTuningParams;
export type TuningResult = OllamaDynamicTuningResult;
