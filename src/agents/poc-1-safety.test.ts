/**
 * SAFETY TEST: Verify POC-1 doesn't negatively impact cloud/large models
 * 
 * Validates that:
 * 1. Models >= 16K context are NOT affected
 * 2. Temperature tuning is only applied to small models
 * 3. Cloud API models (Kimi, Claude, GPT-4) remain unchanged
 * 4. No breaking changes introduced
 */

import { describe, it, expect } from "vitest";
import { calculateDynamicTuning } from "./poc-1-dynamic-tuning.js";

describe("POC-1 SAFETY: Cloud Model Protection", () => {
  describe("Large models should NOT be affected", () => {
    const largeModels = [
      { name: "Kimi-K2.5:cloud", contextWindow: 128 * 1024 },
      { name: "Claude-3.5-Sonnet", contextWindow: 200 * 1024 },
      { name: "GPT-4-Turbo", contextWindow: 128 * 1024 },
      { name: "Llama-70B", contextWindow: 64 * 1024 },
    ];

    for (const model of largeModels) {
      it(`${model.name} (${model.contextWindow}K) uses standard tuning`, () => {
        const tuning = calculateDynamicTuning({
          modelContextWindow: model.contextWindow,
          originalTemp: 0.7,
          systemPromptLength: 2000,
          messageCount: 10,
          toolCount: 5,
        });

        // CRITICAL: Large models should NOT get cold sampling
        expect(tuning.temperature).toBe(0.7);
        expect(tuning.top_p).toBe(0.9);

        // CRITICAL: No penalties for large models
        expect(tuning.presence_penalty).toBeUndefined();
        expect(tuning.frequency_penalty).toBeUndefined();

        // Reasoning should explain no change
        expect(tuning.reasoning).toContain("Standard");
      });
    }
  });

  describe("Only small models get special treatment", () => {
    it("4K context (Qwen) gets cold tuning", () => {
      const tuning = calculateDynamicTuning({
        modelContextWindow: 4096,
        originalTemp: 0.7,
        systemPromptLength: 2000,
        messageCount: 10,
        toolCount: 5,
      });

      expect(tuning.temperature).toBe(0.1);
      expect(tuning.top_p).toBe(0.6);
    });

    it("8K context (GPT-OSS) gets cold tuning", () => {
      const tuning = calculateDynamicTuning({
        modelContextWindow: 8192,
        originalTemp: 0.7,
        systemPromptLength: 2000,
        messageCount: 10,
        toolCount: 5,
      });

      expect(tuning.temperature).toBe(0.1);
      expect(tuning.top_p).toBe(0.6);
    });

    it("16K+ context gets standard tuning", () => {
      const tuning = calculateDynamicTuning({
        modelContextWindow: 16001,
        originalTemp: 0.7,
        systemPromptLength: 2000,
        messageCount: 10,
        toolCount: 5,
      });

      expect(tuning.temperature).toBe(0.7);
      expect(tuning.top_p).toBe(0.9);
    });
  });

  describe("User preferences are respected for large models", () => {
    it("Claude with custom temperature stays unchanged", () => {
      const tuning = calculateDynamicTuning({
        modelContextWindow: 200000,
        originalTemp: 0.5, // User wants colder
        systemPromptLength: 5000,
        messageCount: 50,
        toolCount: 20,
      });

      expect(tuning.temperature).toBe(0.5);
      expect(tuning.top_p).toBe(0.9);
    });

    it("Kimi with high temperature preference is not capped", () => {
      const tuning = calculateDynamicTuning({
        modelContextWindow: 128000,
        originalTemp: 1.5, // User wants creative
        systemPromptLength: 8000,
        messageCount: 30,
        toolCount: 10,
      });

      expect(tuning.temperature).toBe(1.5);
      expect(tuning.top_p).toBe(0.9);
    });
  });

  describe("No API/cloud integration changes", () => {
    it("Default temperature for cloud models is 0.7", () => {
      const tuning = calculateDynamicTuning({
        modelContextWindow: 128 * 1024,
        originalTemp: undefined,
        systemPromptLength: 2000,
        messageCount: 10,
        toolCount: 5,
      });

      expect(tuning.temperature).toBe(0.7);
    });

    it("top_p for cloud models is 0.9", () => {
      const tuning = calculateDynamicTuning({
        modelContextWindow: 100 * 1024,
        originalTemp: undefined,
        systemPromptLength: 2000,
        messageCount: 10,
        toolCount: 5,
      });

      expect(tuning.top_p).toBe(0.9);
    });

    it("No penalties added to cloud models", () => {
      const tuning = calculateDynamicTuning({
        modelContextWindow: 64 * 1024,
        originalTemp: 0.7,
        systemPromptLength: 3000,
        messageCount: 15,
        toolCount: 8,
      });

      expect(tuning.presence_penalty).toBeUndefined();
      expect(tuning.frequency_penalty).toBeUndefined();
    });
  });

  describe("Boundary condition safety", () => {
    it("16000 tokens (boundary) gets cold tuning", () => {
      const tuning = calculateDynamicTuning({
        modelContextWindow: 16000,
        originalTemp: 0.7,
        systemPromptLength: 2000,
        messageCount: 10,
        toolCount: 5,
      });

      expect(tuning.temperature).toBe(0.1);
    });

    it("16001 tokens (just above) gets standard tuning", () => {
      const tuning = calculateDynamicTuning({
        modelContextWindow: 16001,
        originalTemp: 0.7,
        systemPromptLength: 2000,
        messageCount: 10,
        toolCount: 5,
      });

      expect(tuning.temperature).toBe(0.7);
    });
  });

  describe("No negative side effects", () => {
    it("Tuning doesn't affect models with explicit high context", () => {
      const tuning = calculateDynamicTuning({
        modelContextWindow: 32768,
        originalTemp: 0.7,
        systemPromptLength: 2000,
        messageCount: 10,
        toolCount: 5,
      });

      expect(tuning.temperature).toBe(0.7);
      expect(tuning.presence_penalty).toBeUndefined();
    });

    it("Performance is not impacted (calculation is instant)", () => {
      const start = performance.now();

      for (let i = 0; i < 1000; i++) {
        calculateDynamicTuning({
          modelContextWindow: i % 2 === 0 ? 4096 : 128000,
          originalTemp: 0.7,
          systemPromptLength: 2000,
          messageCount: 10,
          toolCount: 5,
        });
      }

      const end = performance.now();
      const avgTime = (end - start) / 1000;

      expect(avgTime).toBeLessThan(0.1); // <0.1ms per call
    });
  });

  describe("Realistic scenarios", () => {
    it("Kimi production use case is unchanged", () => {
      // Typical Kimi call: large prompt, many tools
      const tuning = calculateDynamicTuning({
        modelContextWindow: 128 * 1024,
        originalTemp: 0.7,
        systemPromptLength: 8000,
        messageCount: 50,
        toolCount: 20,
      });

      expect(tuning.temperature).toBe(0.7);
      expect(tuning.top_p).toBe(0.9);
      expect(tuning.presence_penalty).toBeUndefined();
      expect(tuning.frequency_penalty).toBeUndefined();
    });

    it("Qwen production use case gets optimization", () => {
      // Typical Qwen call: limited context, fewer tools
      const tuning = calculateDynamicTuning({
        modelContextWindow: 4096,
        originalTemp: 0.7,
        systemPromptLength: 2000,
        messageCount: 8,
        toolCount: 3,
      });

      expect(tuning.temperature).toBe(0.1);
      expect(tuning.top_p).toBe(0.6);
      expect(tuning.presence_penalty).toBe(0.1);
      expect(tuning.frequency_penalty).toBe(0.05);
    });

    it("Mixed environment: Qwen + Kimi doesn't conflict", () => {
      // Small model
      const qwenTuning = calculateDynamicTuning({
        modelContextWindow: 4096,
        originalTemp: 0.7,
        systemPromptLength: 2000,
        messageCount: 10,
        toolCount: 5,
      });

      // Large model
      const kimiTuning = calculateDynamicTuning({
        modelContextWindow: 128000,
        originalTemp: 0.7,
        systemPromptLength: 2000,
        messageCount: 10,
        toolCount: 5,
      });

      // Each should have different tuning, but both should be valid
      expect(qwenTuning.temperature).not.toBe(kimiTuning.temperature);
      expect(qwenTuning.top_p).not.toBe(kimiTuning.top_p);

      // Kimi should not be affected
      expect(kimiTuning.temperature).toBe(0.7);
      expect(kimiTuning.top_p).toBe(0.9);
    });
  });
});

/**
 * Summary: POC-1 is completely safe for cloud models
 *
 * ✅ Large models (16K+) are NOT affected
 * ✅ User preferences are preserved
 * ✅ No breaking changes
 * ✅ Zero performance impact
 * ✅ Only small models get optimization
 */
