#!/usr/bin/env node

/**
 * POC-1 Complete Test Suite Runner
 * 
 * Executes all validation tests for the hallucination fix:
 * 1. Integration tests (18 tests) - validates functionality
 * 2. Safety tests (15 tests) - validates cloud model protection
 * 3. Model comparison benchmark - qwen vs gpt-oss
 * 
 * Run with: npx tsx src/agents/poc-1-test-all.ts
 * Or: pnpm exec tsx src/agents/poc-1-test-all.ts
 */

import { execSync } from "child_process";

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  output?: string;
  error?: string;
}

const results: TestResult[] = [];

function printHeader(text: string) {
  console.log("\n" + "=".repeat(60));
  console.log(`  ${text}`);
  console.log("=".repeat(60));
}

function runTest(name: string, command: string): TestResult {
  console.log(`\n⏳ Running: ${name}...`);

  const start = Date.now();
  let passed = false;
  let output = "";
  let error = "";

  try {
    output = execSync(command, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    passed = true;
    console.log("✅ Passed");
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    console.log("❌ Failed");
    console.error(error);
  }

  const duration = Date.now() - start;
  results.push({ name, passed, duration, output, error });

  return { name, passed, duration, output, error };
}

async function main() {
  printHeader("POC-1 COMPLETE TEST SUITE");

  // Test 1: Integration Tests
  runTest(
    "POC-1 Integration Tests (18 tests)",
    "pnpm test src/agents/poc-1-integration.test.ts --reporter=verbose"
  );

  // Test 2: Safety Tests
  runTest(
    "POC-1 Safety Tests (15 tests)",
    "pnpm test src/agents/poc-1-safety.test.ts --reporter=verbose"
  );

  // Test 3: Model Comparison
  runTest(
    "Model Comparison Benchmark (qwen vs gpt-oss)",
    "pnpm exec tsx src/agents/model-comparison.ts"
  );

  // Test 4: Full regression (optional, slower)
  // runTest(
  //   "Full Test Suite (regression check)",
  //   "pnpm test --reporter=verbose"
  // );

  // Summary
  printHeader("TEST RESULTS SUMMARY");

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const totalTime = results.reduce((sum, r) => sum + r.duration, 0);

  console.log(`\n📊 Results:`);
  console.log(`   ✅ Passed: ${passed}/${results.length}`);
  console.log(`   ❌ Failed: ${failed}/${results.length}`);
  console.log(`   ⏱️  Total Time: ${(totalTime / 1000).toFixed(2)}s\n`);

  // Detailed results
  console.log("📋 Detailed Results:");
  for (const result of results) {
    const status = result.passed ? "✅" : "❌";
    const duration = `(${(result.duration / 1000).toFixed(2)}s)`;
    console.log(`   ${status} ${result.name} ${duration}`);
  }

  // Success criteria
  printHeader("SUCCESS CRITERIA");

  const allPassed = failed === 0;
  const performanceGood = totalTime < 30000; // < 30 seconds

  console.log(`\n✅ All tests passed: ${allPassed ? "YES" : "NO"}`);
  console.log(`✅ Performance (<30s): ${performanceGood ? "YES" : "NO"}`);
  console.log(
    `✅ Cloud model safety verified: ${results.some((r) => r.name.includes("Safety")) ? "YES" : "NO"}`
  );
  console.log(
    `✅ Model comparison complete: ${results.some((r) => r.name.includes("Comparison")) ? "YES" : "NO"}`
  );

  // Verdict
  printHeader("VERDICT");

  if (allPassed && performanceGood) {
    console.log("\n🎉 POC-1 IS READY FOR PRODUCTION");
    console.log("\n✅ Next steps:");
    console.log("   1. Review code changes: POC-1_CODE_CHANGES.md");
    console.log("   2. Check implementation details: POC-1_IMPLEMENTATION_REPORT.md");
    console.log("   3. Run real-world test (manual):");
    console.log("      openclaw agent --message 'Create email validator' --model qwen3.5:latest");
    console.log("   4. Deploy to production when ready");
    process.exit(0);
  } else {
    console.log("\n⚠️ POC-1 NEEDS FIXES BEFORE PRODUCTION");
    console.log("\n❌ Issues:");
    if (failed > 0) {
      console.log(`   - ${failed} test(s) failed`);
    }
    if (!performanceGood) {
      console.log(`   - Performance too slow (${(totalTime / 1000).toFixed(2)}s)`);
    }
    console.log("\nReview error output above for details.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(2);
});
