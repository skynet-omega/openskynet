import { describe, it, expect } from "vitest";
import { parseModelRef } from "./model-selection.js";

describe("repro-fallback", () => {
  it("incorrectly associates gemini models with the default provider when no prefix is present", () => {
    // Current behavior (demonstrating the bug)
    const result = parseModelRef("gemini-3-flash-preview", "openai-codex");
    expect(result).toEqual({ provider: "openai-codex", model: "gemini-3-flash-preview" });

    // Desired behavior (what we want to fix)
    // expect(result).toEqual({ provider: "google", model: "gemini-3-flash-preview" });
  });

  it("incorrectly associates claude models with the default provider when no prefix is present", () => {
    const result = parseModelRef("claude-3-5-sonnet", "openai-codex");
    expect(result).toEqual({ provider: "openai-codex", model: "claude-3-5-sonnet" });
  });
});
