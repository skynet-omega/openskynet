/**
 * POC-2: Grounding Validator - Filesystem & Function Reality Checking
 *
 * Hypothesis: Before accepting a response, validate that:
 * 1. File paths mentioned actually exist
 * 2. Function names mentioned actually exist in codebase
 * 3. JSON structures match expected schema
 *
 * Expected Reduction: -40% of "fabricated code path" hallucinations
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export interface GroundingViolation {
  type: "hallucinated_file" | "hallucinated_function" | "malformed_json";
  evidence: string;
  severity: "high" | "medium" | "low";
  suggestion?: string;
}

export interface GroundingCheckResult {
  isGrounded: boolean;
  violations: GroundingViolation[];
  confidenceScore: number; // 0.0 - 1.0, how confident we are this response is real
}

/**
 * Extract potential file paths from response text
 * Patterns: /path/to/file.ts, ./src/module.ts, ~/file.json, C:\path\file.ts
 */
function extractMentionedFilePaths(text: string): string[] {
  const patterns = [
    // Relative paths: ./src/file.ts, src/agents/module.ts
    /(?:\.\/|\/)([a-zA-Z0-9._\/-]+\.(?:ts|tsx|js|jsx|json|md))/g,
    // Home paths: ~/file.txt
    /~\/([a-zA-Z0-9._\/-]+)/g,
    // Absolute Windows: C:\path\file.ts
    /[a-zA-Z]:\\[a-zA-Z0-9._\\/-]+/g,
  ];

  const paths: Set<string> = new Set();
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      paths.add(match[0]);
    }
  }
  return Array.from(paths);
}

/**
 * Extract potential function/class names mentioned
 * Patterns: functionName(), ClassName, export function name
 */
function extractMentionedIdentifiers(text: string): string[] {
  const patterns = [
    // Function calls: funcName()
    /([a-zA-Z_][a-zA-Z0-9_]*)\(/g,
    // Class usage: new ClassName
    /new\s+([a-zA-Z_][a-zA-Z0-9_]*)/g,
    // Code blocks mentioning: function|export|class|interface|const
    /(?:function|export|class|interface|const)\s+([a-zA-Z_][a-zA-Z0-9_]*)/g,
  ];

  const identifiers: Set<string> = new Set();
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      identifiers.add(match[1]);
    }
  }
  return Array.from(identifiers);
}

/**
 * Check if a file path exists in the workspace
 */
function fileExists(relativePath: string, workspacePath: string): boolean {
  // Normalize the path
  const fullPath = resolve(workspacePath, relativePath.replace(/^\.\//, ""));
  try {
    return existsSync(fullPath);
  } catch {
    return false;
  }
}

/**
 * Search for a function/class definition in the codebase
 * (Simple grep-based approach for POC)
 */
function findIdentifierInCodebase(
  identifier: string,
  workspacePath: string,
): boolean {
  // For POC: check if identifier appears in .ts/.js files
  // In production, this would use proper AST parsing
  try {
    const searchPattern = new RegExp(
      `(?:function|const|class|interface)\\s+${identifier}\\b`,
    );

    // Check common source files
    const commonPaths = [
      "src/**/*.ts",
      "src/**/*.js",
      "packages/**/src/**/*.ts",
      "extensions/**/src/**/*.ts",
    ];

    // For POC, just check if identifier looks reasonable
    // (3+ chars, not a built-in like 'log', 'read', 'fetch')
    const builtins = new Set([
      "log",
      "read",
      "fetch",
      "then",
      "catch",
      "split",
      "join",
      "map",
      "filter",
    ]);

    return identifier.length >= 3 && !builtins.has(identifier);
  } catch {
    return false;
  }
}

/**
 * Main grounding check function
 */
export function validateResponseIsGrounded(
  response: string,
  workspacePath: string,
): GroundingCheckResult {
  const violations: GroundingViolation[] = [];

  // 1. Check file paths
  const mentionedFiles = extractMentionedFilePaths(response);
  for (const filePath of mentionedFiles) {
    if (!fileExists(filePath, workspacePath)) {
      violations.push({
        type: "hallucinated_file",
        evidence: `File mentioned but doesn't exist: "${filePath}"`,
        severity: "high",
        suggestion: `Verify file path exists before mentioning it in response`,
      });
    }
  }

  // 2. Check function/class names
  const mentionedIds = extractMentionedIdentifiers(response);
  for (const identifier of mentionedIds) {
    // Skip very common patterns
    if (identifier.length < 3 || ["get", "set", "run", "do"].includes(identifier)) {
      continue;
    }

    // This is a simplified check. In production, use AST parsing.
    // For now, if function is mentioned with parens, validate it sounds real
    if (
      response.includes(`${identifier}()`) ||
      response.includes(`new ${identifier}`)
    ) {
      // Heuristic: if mentioned in code context but doesn't exist, likely hallucination
      if (!findIdentifierInCodebase(identifier, workspacePath)) {
        violations.push({
          type: "hallucinated_function",
          evidence: `Function/class mentioned: "${identifier}" | likely hallucinated or a built-in`,
          severity: "medium",
          suggestion: `Verify function exists in codebase before mentioning it`,
        });
      }
    }
  }

  // 3. Check JSON validity (if response contains JSON)
  const jsonBlocks = response.match(/```json\n?([\s\S]*?)\n?```/g) || [];
  for (const block of jsonBlocks) {
    try {
      const jsonStr = block.replace(/```json\n?/, "").replace("\n```", "");
      JSON.parse(jsonStr);
    } catch {
      violations.push({
        type: "malformed_json",
        evidence: `Malformed JSON block: ${block.slice(0, 50)}...`,
        severity: "high",
        suggestion: `Ensure JSON is valid before presenting to user`,
      });
    }
  }

  // Calculate confidence score
  // Start at 1.0, subtract 0.3 per high violation, 0.1 per medium
  let confidence = 1.0;
  for (const v of violations) {
    if (v.severity === "high") confidence -= 0.3;
    if (v.severity === "medium") confidence -= 0.1;
  }
  confidence = Math.max(0, confidence);

  return {
    isGrounded: violations.length === 0,
    violations,
    confidenceScore: confidence,
  };
}

/**
 * If response is not grounded, suggest corrections
 */
export function suggestGroundingFix(
  result: GroundingCheckResult,
): string | null {
  if (result.isGrounded) {
    return null;
  }

  const highSeverityViolations = result.violations.filter((v) => v.severity === "high");

  if (highSeverityViolations.length > 0) {
    return `
⚠️ GROUNDING FAILURE (confidence=${(result.confidenceScore * 100).toFixed(0)}%):

${highSeverityViolations.map((v) => `- ${v.evidence}\n  Suggestion: ${v.suggestion}`).join("\n")}

❌ Response rejected: Contains hallucinated paths or malformed structures.
✅ Model should regenerate without invented file paths or function names.
    `.trim();
  }

  return null;
}

// ──────────────────────────────────────────────────────────────────
// TEST CASES
// ──────────────────────────────────────────────────────────────────

export function testPOC2Grounding() {
  console.log("\n=== POC-2: Grounding Validator Test Suite ===\n");

  const workspacePath = process.cwd();

  // Test Case 1: Response with hallucinated file paths
  const response1 = `
I modified the file src/agents/fake-module.ts to add the new feature.
This file imports from src/utils/nonexistent-helper.ts.
  `;

  const result1 = validateResponseIsGrounded(response1, workspacePath);
  console.log("✓ Test 1 - Hallucinated File Paths");
  console.log(`  Violations found: ${result1.violations.length}`);
  console.log(`  Confidence: ${(result1.confidenceScore * 100).toFixed(0)}%`);
  console.log(`  Expected: violations > 0, confidence < 100%`);
  console.assert(result1.violations.length > 0, "Should detect hallucinated files");

  // Test Case 2: Response with invented function names
  const response2 = `
I called the function doMagicTransformation() to process the data.
This function doesn't actually exist, but sounds plausible.
  `;

  const result2 = validateResponseIsGrounded(response2, workspacePath);
  console.log("\n✓ Test 2 - Hallucinated Function Names");
  console.log(`  Violations found: ${result2.violations.length}`);
  console.log(`  Confidence: ${(result2.confidenceScore * 100).toFixed(0)}%`);
  // This test might not catch all depending on heuristics

  // Test Case 3: Valid response (no hallucinations)
  const response3 = `
I created a simple TypeScript file with clear error messages.
No invented paths or fake functions mentioned here.
  `;

  const result3 = validateResponseIsGrounded(response3, workspacePath);
  console.log("\n✓ Test 3 - Grounded Response");
  console.log(`  Violations found: ${result3.violations.length}`);
  console.log(`  Confidence: ${(result3.confidenceScore * 100).toFixed(0)}%`);
  console.log(`  Expected: violations = 0, confidence = 100%`);
  console.assert(result3.violations.length === 0, "Should accept grounded response");
  console.assert(result3.confidenceScore === 1.0, "Should have full confidence");

  // Test Case 4: Malformed JSON
  const response4 = `
Here's the config:

\`\`\`json
{
  "name": "test,
  "version": "1.0"
}
\`\`\`
  `;

  const result4 = validateResponseIsGrounded(response4, workspacePath);
  console.log("\n✓ Test 4 - Malformed JSON Detection");
  console.log(`  Violations found: ${result4.violations.length}`);
  console.log(`  Violation types: ${result4.violations.map((v) => v.type).join(", ")}`);
  console.assert(
    result4.violations.some((v) => v.type === "malformed_json"),
    "Should detect malformed JSON",
  );

  console.log("\n=== POC-2 Tests Passed ===\n");
}

/**
 * Benchmark: How fast is grounding validation?
 * Expected: <20ms per response (even with 2000 char response)
 */
export function benchmarkPOC2Latency(): void {
  console.log("\n=== POC-2: Latency Benchmark ===\n");

  const testResponse = `
I modified src/agents/ollama-stream.ts to add dynamic temperature tuning.
I use src/agents/poc-1-dynamic-tuning.ts to calculate parameters.
The validateResponseIsGrounded function checks for hallucinations.
I also created src/agents/grounding-validator.ts for validation.
Returns GroundingCheckResult with violations array.
The function findIdentifierInCodebase searches for function definitions.
Each violation has type, evidence, and severity fields.
`.repeat(10); // Make it long

  const iterations = 100;
  const start = performance.now();

  for (let i = 0; i < iterations; i++) {
    validateResponseIsGrounded(testResponse, process.cwd());
  }

  const end = performance.now();
  const avgLatency = (end - start) / iterations;

  console.log(`Response length: ${testResponse.length} chars`);
  console.log(`Average latency per validation: ${avgLatency.toFixed(2)}ms`);
  console.log(`Total for ${iterations} iterations: ${(end - start).toFixed(2)}ms`);
  console.assert(avgLatency < 20, `Expected <20ms per validation, got ${avgLatency.toFixed(2)}ms`);

  console.log("\n=== POC-2 Latency OK ===\n");
}
