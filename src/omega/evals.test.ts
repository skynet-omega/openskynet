import { describe, expect, it } from "vitest";
import { evaluateOmegaTurn } from "./evals.js";

describe("omega evals", () => {
  it("fails a turn when structured validation breaks", () => {
    const evaluation = evaluateOmegaTurn({
      task: "return json",
      validation: {
        expectsJson: true,
        expectedKeys: ["status", "summary"],
      },
      reply: '{"status":"ok"}',
    });

    expect(evaluation).toMatchObject({
      ok: false,
      errorKind: "invalid_structured_result",
      validation: {
        structured: {
          ok: false,
        },
      },
    });
  });

  it("fails a turn as low value when nothing useful happened", () => {
    const evaluation = evaluateOmegaTurn({
      task: "investigate",
      reply: "investigate",
      observedChangedFiles: [],
    });

    expect(evaluation).toMatchObject({
      ok: false,
      errorKind: "low_value_result",
      critique: {
        verdict: "low_value",
      },
    });
  });
});
