import { describe, expect, it } from "vitest";
import { critiqueOmegaOutcome } from "./critic.js";

describe("omega critic", () => {
  it("classifies verified target writes as high value", () => {
    const critique = critiqueOmegaOutcome({
      task: "patch workspace/file.py",
      validation: {
        write: {
          ok: true,
          message: "observed disk delta on every required target path",
          expectedPaths: ["workspace/file.py"],
          observedChangedFiles: ["workspace/file.py"],
        },
      },
      reply: "Patched workspace/file.py and updated the failing branch.",
      observedChangedFiles: ["workspace/file.py"],
      expectedPaths: ["workspace/file.py"],
    });

    expect(critique).toMatchObject({
      verdict: "high_value",
      score: 0.9,
    });
  });

  it("flags empty turns without writes as low value", () => {
    const critique = critiqueOmegaOutcome({
      task: "investigate issue",
      reply: "done",
      observedChangedFiles: [],
      expectedPaths: [],
    });

    expect(critique).toMatchObject({
      verdict: "low_value",
      errorKind: "low_value_result",
    });
  });

  it("accepts HEARTBEAT_OK as a substantive reply to avoid low_value_result", () => {
    const critique = critiqueOmegaOutcome({
      task: "maintain system",
      reply: "HEARTBEAT_OK",
      observedChangedFiles: [],
      expectedPaths: [],
    });

    expect(critique.verdict).toBe("useful");
    expect(critique.reasons).toContain("substantive_reply");
  });

  it("accepts HEARTBEAT_OK. with a dot as a substantive reply", () => {
    const critique = critiqueOmegaOutcome({
      task: "maintain system",
      reply: "HEARTBEAT_OK.",
      observedChangedFiles: [],
      expectedPaths: [],
    });

    expect(critique.verdict).toBe("useful");
    expect(critique.reasons).toContain("substantive_reply");
  });
});
