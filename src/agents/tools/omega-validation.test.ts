import { describe, expect, it } from "vitest";
import { buildOmegaValidationPrompt } from "./omega-validation.js";

describe("omega validation prompt", () => {
  it("renders explicit protected paths for local edit contracts", () => {
    const prompt = buildOmegaValidationPrompt({
      expectedKeys: [],
      expectedPaths: ["src/target.ts"],
      watchedPaths: ["src/target.ts", "src/protected.ts"],
    });

    expect(prompt).toContain("[OMEGA Local Edit Contract]");
    expect(prompt).toContain("Target paths: src/target.ts");
    expect(prompt).toContain("Protected paths: src/protected.ts");
  });
});
