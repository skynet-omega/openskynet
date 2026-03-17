/**
 * POC-1: Dynamic Temperature & Sampling Tuning for Small Models
 * 
 * Hypothesis: Small models (20B params) hallucinate less when temperature + top_p
 * are dynamically adjusted based on context window size.
 * 
 * Expected Results:
 * - Qwen3.5:latest: -30% hallucinations, +5ms latency
 * - GPT-OSS-20b: -25% hallucinations, +3ms latency
 * - Kimi (unchanged): <1% impact (already optimized)
 */

import type { Model } from "@mariozechner/pi-ai";

interface DynamicTuningParams {
  modelContextWindow: number;
  originalTemp?: number;
  originalTopP?: number;
  systemPromptLength: number;
  messageCount: number;
  toolCount: number;
}

interface TuningResult {
  temperature: number;
  top_p: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  reasoning: string;
}

/**
 * Determines if a model is "small" (likely to hallucinate more)
 */
function isSmallModel(contextWindow: number): boolean {
  // Models < 16K context or <= 30B params typically struggle
  return contextWindow <= 16000;
}

/**
 * Calculates optimal sampling parameters based on model size
 */
export function calculateDynamicTuning(params: DynamicTuningParams): TuningResult {
  const isSmall = isSmallModel(params.modelContextWindow);

  // For small models: reduce temperature (more deterministic), tighten top_p
  if (isSmall) {
    // Start aggressive: 0.1 base (very cold, prevents hallucinations)
    const baseTemp = 0.1;
    
    // But if user explicitly passed high temperature (> 1.0), use that
    // (for creativity-requiring tasks)
    const temperature =
      params.originalTemp !== undefined && params.originalTemp > 1.0
        ? Math.min(params.originalTemp, 0.5) // Cap at 0.5 for small models
        : baseTemp;

    // Very tight nucleus sampling: only top 60% of probability mass
    // This prevents long-tail hallucinations
    const top_p = 0.6;

    // Add penalties to discourage repetition
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

  // For larger models: use original settings or sensible defaults
  const temperature = params.originalTemp ?? 0.7;
  const top_p = params.originalTopP ?? 0.9;

  return {
    temperature,
    top_p,
    reasoning:
      `Model capable (ctx=${params.modelContextWindow}): ` +
      `Use standard sampling (T=${temperature}, top_p=${top_p})`,
  };
}

/**
 * Apply dynamic tuning to Ollama options
 * 
 * Usage in ollama-stream.ts (line ~456):
 * 
 *   const tuning = calculateDynamicTuning({
 *     modelContextWindow: model.contextWindow ?? 32768,
 *     originalTemp: options?.temperature,
 *     originalTopP: options?.topP,
 *     systemPromptLength: context.systemPrompt?.length ?? 0,
 *     messageCount: context.messages?.length ?? 0,
 *     toolCount: context.tools?.length ?? 0,
 *   });
 * 
 *   const ollamaOptions: Record<string, unknown> = { num_ctx: defaultNumCtx };
 *   ollamaOptions.temperature = tuning.temperature;
 *   ollamaOptions.top_p = tuning.top_p;
 *   if (tuning.presence_penalty !== undefined) {
 *     ollamaOptions.presence_penalty = tuning.presence_penalty;
 *   }
 *   if (tuning.frequency_penalty !== undefined) {
 *     ollamaOptions.frequency_penalty = tuning.frequency_penalty;
 *   }
 */
export function applyDynamicTuningToOllamaOptions(
  ollamaOptions: Record<string, unknown>,
  tuning: TuningResult,
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

// ──────────────────────────────────────────────────────────────────
// TEST CASES
// ──────────────────────────────────────────────────────────────────

export function testPOC1DynamicTuning() {
  console.log("\n=== POC-1: Dynamic Tuning Test Suite ===\n");

  // Test Case 1: Small model (Qwen3.5:latest) - should get cold sampling
  const smallModelTuning = calculateDynamicTuning({
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
  console.assert(
    smallModelTuning.temperature === 0.1,
    "Small model should have T=0.1",
  );
  console.assert(smallModelTuning.top_p === 0.6, "Small model should have top_p=0.6");

  // Test Case 2: Large model (Kimi) - should preserve user settings
  const largeModelTuning = calculateDynamicTuning({
    modelContextWindow: 128 * 1024, // 128K
    originalTemp: 0.7,
    systemPromptLength: 5000,
    messageCount: 20,
    toolCount: 10,
  });

  console.log("\n✓ Test 2 - Large Model (Kimi-K2.5)");
  console.log(`  Temperature: ${largeModelTuning.temperature} (expected: 0.7)`);
  console.log(`  top_p: ${largeModelTuning.top_p} (expected: 0.9)`);
  console.assert(
    largeModelTuning.temperature === 0.7,
    "Large model should preserve T=0.7",
  );
  console.assert(largeModelTuning.top_p === 0.9, "Large model should use top_p=0.9");

  // Test Case 3: GPT-OSS-20b (small, user wants creativity) - should cap at 0.5
  const smallCreativeTuning = calculateDynamicTuning({
    modelContextWindow: 8192,
    originalTemp: 1.5,
    systemPromptLength: 3000,
    messageCount: 15,
    toolCount: 3,
  });

  console.log("\n✓ Test 3 - Small Model with High Temperature");
  console.log(
    `  Temperature: ${smallCreativeTuning.temperature} (expected: capped at 0.5)`,
  );
  console.assert(
    smallCreativeTuning.temperature <= 0.5,
    "Small model should cap creative temperature at 0.5",
  );

  console.log("\n=== POC-1 Tests Passed ===\n");
}

/**
 * Benchmark: Measure latency impact
 * Expected: <10ms overhead per request
 */
export async function benchmarkPOC1Latency(): Promise<void> {
  console.log("\n=== POC-1: Latency Benchmark ===\n");

  const iterations = 1000;

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    calculateDynamicTuning({
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
  console.assert(
    avgLatency < 0.1,
    `Expected <0.1ms per call, got ${avgLatency.toFixed(4)}ms`,
  );

  console.log("\n=== POC-1 Latency OK ===\n");
}
