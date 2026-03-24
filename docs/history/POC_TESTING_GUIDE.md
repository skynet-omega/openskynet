# POC Testing Plan - OpenSkyNet Local Model Improvements

## 📋 Overview

OpenSkyNet has **hallucination problems with local models** (qwen3.5:latest, gpt-oss-safeguard:20b) but **NOT with cloud models** (kimi-k2.5:cloud).

This document explains three **Proof of Concept** solutions to test before permanent implementation.

---

## 🎯 The Problem

| Model           | Issue                                   | Cause                                     |
| --------------- | --------------------------------------- | ----------------------------------------- |
| Qwen3.5:latest  | ❌ Invents file paths, function names   | Limited reasoning with small params (20B) |
| GPT-OSS-20b     | ❌ Hallucinated code, wrong API calls   | Context window insufficient (4K-8K)       |
| Kimi-K2.5:cloud | ✅ Correct responses, no hallucinations | Large model (100B+), better training      |

---

## 🧪 Three POCs to Test

### POC-1: Dynamic Temperature Tuning

**File:** `src/agents/poc-1-dynamic-tuning.ts`

| What                  | Details                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------ |
| **Problem it solves** | Small models use generic temperature (0.7) causing randomness                                          |
| **Solution**          | Automatically set temperature=0.1 for models < 16K context (very cold, less creative but more precise) |
| **Expected impact**   | -25% hallucinations, +5ms latency                                                                      |
| **Complexity**        | LOW (just 20 lines in ollama-stream.ts)                                                                |
| **Effort**            | EASY (1 function call added)                                                                           |

**How it works:**

```
Model: Qwen3.5 (4K context)
  → Calculate: temperature = 0.1, top_p = 0.6
  → Less randomness = Fewer invented paths
```

---

### POC-2: Grounding Validator

**File:** `src/agents/poc-2-grounding-validator.ts`

| What                  | Details                                                    |
| --------------------- | ---------------------------------------------------------- |
| **Problem it solves** | Detect hallucinations BEFORE delivering response           |
| **Solution**          | Validate responses against filesystem and codebase reality |
| **Expected impact**   | -40% hallucinated file paths, -30% invented function names |
| **Complexity**        | MEDIUM (regex + file existence checks)                     |
| **Effort**            | MODERATE (integrate into subagent-spawn.ts)                |

**How it works:**

```
Response: "I modified src/agents/fake-module.ts"
  ↓ Validation
  ✗ File doesn't exist
  → Response rejected
  → Model prompted to correct
```

---

### POC-3: Compressed System Prompts

**File:** `src/agents/poc-3-compressed-prompts.ts`

| What                  | Details                                                                    |
| --------------------- | -------------------------------------------------------------------------- |
| **Problem it solves** | Large prompts waste tokens on small models (4K context)                    |
| **Solution**          | Generate minimal, task-specific prompts instead of 2000-token generic ones |
| **Expected impact**   | -20% tokens used, +15% task accuracy on small models                       |
| **Complexity**        | LOW (string generation)                                                    |
| **Effort**            | EASY (template functions)                                                  |

**How it works:**

```
Original prompt: 2000 tokens
  ↓ Generate compressed
Compressed prompt: 400 tokens
  → 1600 tokens freed for messages
  → Better reasoning with actual context
```

---

## 🚀 How to Run Tests

### Prerequisites

```bash
cd /home/daroch/openskynet
pnpm install  # If not done already
```

### Run All POC Tests

```bash
# Using pnpm + tsx
pnpm exec tsx src/agents/poc-test-runner.ts

# OR using bun (faster)
bun src/agents/poc-test-runner.ts
```

### Run Individual POC

```bash
# POC-1 only
pnpm exec tsx -e "import { testPOC1DynamicTuning } from './src/agents/poc-1-dynamic-tuning.js'; testPOC1DynamicTuning();"

# POC-2 only
pnpm exec tsx -e "import { testPOC2Grounding } from './src/agents/poc-2-grounding-validator.js'; testPOC2Grounding();"

# POC-3 only
pnpm exec tsx -e "import { testPOC3CompressedPrompts } from './src/agents/poc-3-compressed-prompts.js'; testPOC3CompressedPrompts();"
```

---

## 📊 Expected Test Output

```
╔════════════════════════════════════════════════════════════════════╗
║                    POC TEST SUITE - OpenSkyNet                     ║
╚════════════════════════════════════════════════════════════════════╝

═══════════════════════════════════════════════════════════════════
POC-1: DYNAMIC TEMPERATURE & SAMPLING TUNING
═══════════════════════════════════════════════════════════════════

✓ Test 1 - Small Model (Qwen3.5:latest)
  Temperature: 0.1 (expected: 0.1) ✅
  top_p: 0.6 (expected: 0.6) ✅

✓ Test 2 - Large Model (Kimi-K2.5)
  Temperature: 0.7 (expected: 0.7) ✅
  top_p: 0.9 (expected: 0.9) ✅

=== POC-1 Tests Passed ===

[...similar for POC-2 and POC-3...]

═══════════════════════════════════════════════════════════════════
RESULTS SUMMARY
═══════════════════════════════════════════════════════════════════

┌─────────────────────┬────────┬──────────┬────────────────────────────┐
│ POC                 │ Status │ Latency  │ Expected Improvement       │
├─────────────────────┼────────┼──────────┼────────────────────────────┤
│ POC-1: Dynamic Tuning │ ✅ PASS │  0.02ms │ -25% hallucinations       │
│ POC-2: Grounding Val  │ ✅ PASS │  5.10ms │ -40% file path halluc.    │
│ POC-3: Compressed Pmt │ ✅ PASS │  0.30ms │ -20% tokens, better reason│
└─────────────────────┴────────┴──────────┴────────────────────────────┘

🏆 WINNER: POC-1: Dynamic Tuning
   - Expected reduction: 30% hallucinations
   - Complexity: low
   - Implementation effort: easy
```

---

## 🔬 Real-World Testing (After POCs Pass)

Once POC tests pass, do **actual runtime testing** with your models:

### Test Setup

```bash
# Terminal 1: Start ollama locally
ollama serve

# Terminal 2: Start gateway
openclaw gateway run --port 18789 --verbose

# Terminal 3: Run tests
openclaw agent --message "Implement a function to validate email addresses" \
  --thinking high \
  --model qwen3.5:latest
```

### What to Measure

1. **Response time:** How long does each model take?
2. **Hallucinations:** Count invented file paths/function names
3. **Accuracy:** Does the response solve the actual problem?
4. **Token efficiency:** How many tokens were consumed?

### Report Template

```
POC-1 (Dynamic Tuning) Test Results:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Model: qwen3.5:latest
Requests tested: 10
Response time: 2.3s average
Hallucinations observed: 1 (5 before POC)
Accuracy (tasks completed): 90% (70% before)
Recommendation: ✅ KEEP - Clear improvement

Model: gpt-oss-safeguard:20b
Requests tested: 10
Response time: 4.1s average
Hallucinations observed: 2 (7 before POC)
Accuracy: 85% (65% before POC)
Recommendation: ✅ KEEP - Significant improvement
```

---

## 📈 Decision Criteria

After running tests, decide which POC to **keep permanently** based on:

| Factor                    | Weight | Measurement                               |
| ------------------------- | ------ | ----------------------------------------- |
| Hallucination reduction   | 40%    | Compare before/after error counts         |
| Implementation complexity | 25%    | Lines of code changed, dependencies added |
| Performance impact        | 20%    | Latency overhead per request              |
| Side effects              | 15%    | Does it break existing functionality?     |

**Minimum threshold to keep:** 20% hallucination reduction with <10ms overhead

---

## 🛠️ Implementation Path (After Winner Selected)

If POC-1 wins (most likely):

### Step 1: Modify `ollama-stream.ts`

```typescript
// Line ~450, in createOllamaStreamFn() function:

import { calculateDynamicTuning } from "./poc-1-dynamic-tuning.js";

const tuning = calculateDynamicTuning({
  modelContextWindow: model.contextWindow ?? 32768,
  originalTemp: options?.temperature,
  systemPromptLength: context.systemPrompt?.length ?? 0,
  messageCount: context.messages?.length ?? 0,
  toolCount: context.tools?.length ?? 0,
});

const ollamaOptions: Record<string, unknown> = { num_ctx: defaultNumCtx };
ollamaOptions.temperature = tuning.temperature; // CHANGED
ollamaOptions.top_p = tuning.top_p; // ADDED
if (tuning.presence_penalty !== undefined) {
  // ADDED
  ollamaOptions.presence_penalty = tuning.presence_penalty;
}
```

### Step 2: Run Tests

```bash
pnpm test src/agents/ollama-stream.test.ts
```

### Step 3: Verify No Regressions

```bash
pnpm test  # Full test suite
pnpm lint
```

### Step 4: Commit & PR

```bash
git add src/agents/ollama-stream.ts src/agents/poc-1-dynamic-tuning.ts
git commit -m "feat: add dynamic temperature tuning for small models

- Automatically reduce temperature (0.1) + top_p (0.6) for models < 16K context
- Reduces hallucinations by ~25% on qwen3.5/gpt-oss
- No impact on kimi or larger models
- <1ms overhead per request"
```

### Step 5: Delete POCs (Clean Up)

```bash
# Keep only the winner implementation
rm src/agents/poc-2-grounding-validator.ts
rm src/agents/poc-3-compressed-prompts.ts
rm src/agents/poc-test-runner.ts

# Or keep them for documentation (optional)
```

---

## ⚠️ Potential Issues & Solutions

| Issue                             | Solution                                     |
| --------------------------------- | -------------------------------------------- |
| Tests fail on Windows WSL2        | Use `bun` instead of `pnpm tsx`              |
| Out of memory on large iterations | Lower `iterations` count in benchmarks       |
| File not found errors             | Ensure paths are absolute or relative to cwd |
| Temperature ignored by Ollama     | Check `~/.ollama/models` for model variant   |

---

## 📞 Questions?

If tests fail or results are unexpected:

1. **Check logs:** Look at ollama logs: `tail -f ~/.ollama/ollama.log`
2. **Verify model:** Ensure models are installed: `ollama list`
3. **Test connection:** `curl http://127.0.0.1:11434/api/tags`
4. **Debug output:** Add `--verbose` to commands

---

## 📚 Summary

| File                           | Purpose                                        |
| ------------------------------ | ---------------------------------------------- |
| `poc-1-dynamic-tuning.ts`      | Auto-adjust temperature based on model size    |
| `poc-2-grounding-validator.ts` | Validate responses against filesystem reality  |
| `poc-3-compressed-prompts.ts`  | Generate minimal prompts for small models      |
| `poc-test-runner.ts`           | Master test runner, produces comparison report |

**Next Step:** Run `pnpm exec tsx src/agents/poc-test-runner.ts` and report results! 🚀
