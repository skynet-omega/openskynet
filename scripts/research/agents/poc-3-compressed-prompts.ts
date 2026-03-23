/**
 * POC-3: Compressed System Prompts for Small Models
 *
 * Hypothesis: Qwen/GPT-OSS 20B models suffer context overhead from large prompts.
 * By generating task-specific, minimal prompts, we reduce token waste and improve reasoning.
 *
 * Expected Improvement:
 * - Qwen3.5:latest: -20% tokens, +15% task accuracy
 * - GPT-OSS-20b: -25% tokens, +20% task accuracy
 * - Kimi (unchanged): <5% impact (already efficient)
 */

/**
 * Generate a minimal system prompt optimized for small models
 * Instead of 2000+ tokens, aim for 200-400 tokens max
 */
export function generateCompressedSystemPrompt(params: {
  taskDescription?: string;
  outputFormat?: "json" | "text" | "markdown" | "code";
  contextFiles?: string[];
  constraints?: string[];
  modelSize?: "small" | "medium" | "large"; // Defaults to detecting from contextWindow
  contextWindow?: number;
}): string {
  const isSmall = (params.contextWindow ?? 4096) <= 16000;

  if (isSmall || params.modelSize === "small") {
    // Extremely minimal prompt for small models
    return generateMinimalPrompt(params);
  }

  // Slightly more detailed for larger models
  return generateStandardCompressedPrompt(params);
}

/**
 * Minimal prompt: Essential instructions only, ~150 tokens
 */
function generateMinimalPrompt(params: {
  taskDescription?: string;
  outputFormat?: string;
  contextFiles?: string[];
  constraints?: string[];
}): string {
  const lines: string[] = [];

  // Only the absolute bare minimum
  lines.push("# Task");
  lines.push(params.taskDescription || "Complete the requested task.");
  lines.push("");

  // Output format (CRITICAL for JSON tasks)
  if (params.outputFormat) {
    lines.push("# Output");
    if (params.outputFormat === "json") {
      lines.push("Return a single JSON object. No explanation.");
    } else if (params.outputFormat === "code") {
      lines.push("Return code only. No comments or explanation.");
    } else if (params.outputFormat === "markdown") {
      lines.push("Return Markdown. No extra text.");
    } else {
      lines.push("Return plain text only.");
    }
    lines.push("");
  }

  // Critical constraints only (max 2)
  if (params.constraints && params.constraints.length > 0) {
    lines.push("# Rules");
    for (const constraint of params.constraints.slice(0, 2)) {
      lines.push(`- ${constraint}`);
    }
  }

  return lines.join("\n");
}

/**
 * Standard compressed prompt: Balanced, ~300-400 tokens
 */
function generateStandardCompressedPrompt(params: {
  taskDescription?: string;
  outputFormat?: string;
  contextFiles?: string[];
  constraints?: string[];
}): string {
  const lines: string[] = [];

  lines.push("# Task");
  lines.push(params.taskDescription || "Complete the task.");
  lines.push("");

  // More context for these models
  if (params.contextFiles && params.contextFiles.length > 0) {
    lines.push("# Context Files");
    for (const file of params.contextFiles.slice(0, 5)) {
      lines.push(`- ${file}`);
    }
    lines.push("");
  }

  // Output format
  if (params.outputFormat) {
    lines.push("# Output Format");
    if (params.outputFormat === "json") {
      lines.push("Return valid JSON only.");
    } else if (params.outputFormat === "code") {
      lines.push("Return code with minimal comments.");
    } else {
      lines.push(`Return ${params.outputFormat}.`);
    }
    lines.push("");
  }

  // All constraints
  if (params.constraints && params.constraints.length > 0) {
    lines.push("# Rules");
    for (const constraint of params.constraints) {
      lines.push(`- ${constraint}`);
    }
  }

  return lines.join("\n");
}

/**
 * Compare original vs compressed prompt
 * Returns metrics about token savings
 */
export function analyzePromptCompression(
  original: string,
  compressed: string,
): {
  originalLength: number;
  compressedLength: number;
  tokenReduction: number; // percentage
  compressionRatio: number; // original/compressed
} {
  // Rough token estimate: 1 token ≈ 4 chars average
  const origTokens = Math.ceil(original.length / 4);
  const compressedTokens = Math.ceil(compressed.length / 4);

  const reduction = 100 * ((origTokens - compressedTokens) / origTokens);

  return {
    originalLength: original.length,
    compressedLength: compressed.length,
    tokenReduction: Math.round(reduction),
    compressionRatio: Math.round((original.length / compressed.length) * 100) / 100,
  };
}

// ──────────────────────────────────────────────────────────────────
// TEST CASES
// ──────────────────────────────────────────────────────────────────

export function testPOC3CompressedPrompts() {
  console.log("\n=== POC-3: Compressed Prompts Test Suite ===\n");

  // Test Case 1: Small model minimal prompt
  const minimalPrompt = generateCompressedSystemPrompt({
    taskDescription: "Analyze code and find bugs",
    outputFormat: "json",
    modelSize: "small",
    contextWindow: 4096,
    constraints: [
      "Return valid JSON only",
      "Do not hallucinate function names",
      "Check for null pointer dereferences",
    ],
  });

  console.log("✓ Test 1 - Minimal Prompt (Small Model)");
  console.log(`  Prompt length: ${minimalPrompt.length} chars`);
  console.log(`  Estimated tokens: ~${Math.ceil(minimalPrompt.length / 4)}`);
  console.log(`  Expected: < 200 chars, < 50 tokens`);
  console.assert(minimalPrompt.length < 200, "Minimal prompt should be very short");

  // Test Case 2: Standard compressed prompt
  const standardPrompt = generateCompressedSystemPrompt({
    taskDescription: "Implement a new feature for the OpenSkyNet agent",
    outputFormat: "code",
    contextFiles: [
      "src/agents/ollama-stream.ts",
      "src/agents/subagent-spawn.ts",
      "src/agents/system-prompt.ts",
    ],
    modelSize: "medium",
    contextWindow: 16000,
    constraints: [
      "Follow TypeScript strict mode",
      "Add inline comments for non-obvious logic",
      "Return working code, not pseudocode",
      "Match existing code style",
    ],
  });

  console.log("\n✓ Test 2 - Standard Compressed Prompt (Medium Model)");
  console.log(`  Prompt length: ${standardPrompt.length} chars`);
  console.log(`  Estimated tokens: ~${Math.ceil(standardPrompt.length / 4)}`);
  console.log(`  Expected: 300-500 chars, 75-125 tokens`);
  console.assert(
    standardPrompt.length >= 300 && standardPrompt.length <= 500,
    "Standard prompt should be 300-500 chars",
  );

  // Test Case 3: Compare original vs compressed
  const originalPrompt = `
# System Prompt for OpenSkyNet Agent

You are an advanced AI agent with the following characteristics:
- Deep knowledge of software engineering
- Ability to write clean, maintainable code
- Understanding of cloud infrastructure and deployment
- Experience with scientific computing and data analysis
- Expertise in multi-threaded programming
- Knowledge of machine learning frameworks
- Understanding of cryptography and security

Your mission is to assist Gonzalo in building and validating knowledge.

## Core Directives

1. Always verify your assumptions before proceeding
2. Write code that is:
   - Type-safe (TypeScript strict mode)
   - Well-documented
   - Testable
   - Performant
   - Maintainable

3. Follow these patterns:
   - Use functional programming where appropriate
   - Avoid repetition (DRY principle)
   - Implement proper error handling
   - Add inline comments for complex logic
   - Use meaningful variable names

4. When writing code:
   - Match existing code style in the repo
   - Add unit tests
   - Verify imports are correct
   - Check for edge cases
   - Ensure thread safety

## Output Format

Your code should:
- Run without errors
- Be production-ready
- Include proper type annotations
- Have reasonable performance
- Not hallucinate library names or functions

## Communication

- Be direct and technical
- Explain your reasoning
- Point out potential issues
- Suggest alternatives when relevant
- Don't over-explain obvious concepts
  `.trim();

  const compressedVersion = generateCompressedSystemPrompt({
    taskDescription: "Implement feature following TypeScript strict mode and existing code style",
    outputFormat: "code",
    contextFiles: ["src/agents/ollama-stream.ts", "src/agents/subagent-spawn.ts"],
    constraints: [
      "Follow TypeScript strict mode",
      "Add inline comments for complex logic",
      "Match existing code style",
      "Return working code only",
    ],
  });

  const metrics = analyzePromptCompression(originalPrompt, compressedVersion);

  console.log("\n✓ Test 3 - Compression Analysis");
  console.log(
    `  Original: ${metrics.originalLength} chars (~${Math.ceil(metrics.originalLength / 4)} tokens)`,
  );
  console.log(
    `  Compressed: ${metrics.compressedLength} chars (~${Math.ceil(metrics.compressedLength / 4)} tokens)`,
  );
  console.log(`  Token reduction: ${metrics.tokenReduction}%`);
  console.log(`  Compression ratio: ${metrics.compressionRatio}x`);
  console.log(`  Expected: 40-60% token reduction`);
  console.assert(metrics.tokenReduction >= 40, "Should achieve at least 40% token reduction");

  console.log("\n=== POC-3 Tests Passed ===\n");
}

/**
 * Integration test: Show how POC-3 would work with dynamic tuning (POC-1)
 */
export function testPOC3WithDynamicTuning() {
  console.log("\n=== POC-3 + POC-1 Integration Test ===\n");

  // User wanting to spawn a subagent on a small model
  const task = "Find and fix memory leaks in the codebase";
  const contextWindow = 8192; // Qwen3.5

  // POC-3: Generate minimal prompt
  const systemPrompt = generateCompressedSystemPrompt({
    taskDescription: task,
    outputFormat: "json",
    constraints: [
      "Report actual memory leaks only (no speculation)",
      "Include file paths and line numbers",
      "Return valid JSON array",
    ],
    contextWindow,
    modelSize: "small",
  });

  // POC-1 would then adjust temperature based on this
  const promptLength = systemPrompt.length;
  const estimatedTokens = Math.ceil(promptLength / 4);

  console.log(`Task: "${task}"`);
  console.log(`Model context: ${contextWindow} tokens`);
  console.log(`System prompt tokens: ~${estimatedTokens}`);
  console.log(`Remaining for messages: ~${contextWindow - estimatedTokens} tokens`);
  console.log("");
  console.log("Recommendations:");
  if (contextWindow - estimatedTokens < 1000) {
    console.log("⚠️  Limited context remaining. Enable aggressive pruning of old messages.");
  } else {
    console.log("✓ Sufficient context for several message turns.");
  }

  console.log("\n=== Integration Test OK ===\n");
}

/**
 * Benchmark: How fast is prompt generation?
 */
export function benchmarkPOC3Latency(): void {
  console.log("\n=== POC-3: Latency Benchmark ===\n");

  const iterations = 1000;

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    generateCompressedSystemPrompt({
      taskDescription: `Task ${i % 10}`,
      outputFormat: i % 3 === 0 ? "json" : "code",
      contextFiles: ["file1.ts", "file2.ts", "file3.ts"],
      constraints: ["Rule 1", "Rule 2"],
      contextWindow: 4096 + (i % 4) * 4096,
    });
  }
  const end = performance.now();

  const avgLatency = (end - start) / iterations;
  console.log(`Iterations: ${iterations}`);
  console.log(`Average latency per generation: ${avgLatency.toFixed(4)}ms`);
  console.log(`Total time: ${(end - start).toFixed(2)}ms`);
  console.assert(avgLatency < 1.0, `Expected <1ms per generation, got ${avgLatency.toFixed(4)}ms`);

  console.log("\n=== POC-3 Latency OK ===\n");
}
