import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildOmegaInteractionPrompt, interpretOmegaInput } from "./interaction-model.js";
import { recordOmegaSessionOutcome, type OmegaSessionValidationSnapshot } from "./session-context.js";

describe("omega interaction model", () => {
  let workspaceRoot = "";
  const validation: OmegaSessionValidationSnapshot = {
    expectsJson: true,
    expectedKeys: ["status", "summary"],
    expectedPaths: ["workspace/manual_code_probe/range_tools.py"],
  };

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openskynet-omega-interaction-"));
  });

  afterEach(async () => {
    if (workspaceRoot) {
      await fs.rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("classifies corrective feedback when the turn references a prior failed attempt", () => {
    const interpretation = interpretOmegaInput({
      task: "that still failed, fix the target file again and return valid json",
      validation,
      timeline: [
        {
          createdAt: Date.now(),
          task: "fix the file",
          validation,
          outcome: {
            status: "error",
            errorKind: "target_not_touched",
          },
        },
      ],
    });

    expect(interpretation.kind).toBe("corrective_feedback");
    expect(interpretation.recentFailureKinds).toEqual(["target_not_touched"]);
    expect(interpretation.hasTemporalReference).toBe(true);
  });

  it("classifies structured inspection as verification when no edit is requested", () => {
    const interpretation = interpretOmegaInput({
      task: "verify the failing output and return json with status and summary",
      validation: {
        expectsJson: true,
        expectedKeys: ["status", "summary"],
        expectedPaths: [],
      },
      timeline: [],
    });

    expect(interpretation.kind).toBe("verification_request");
    expect(interpretation.hasActionRequest).toBe(false);
    expect(interpretation.hasVerificationRequest).toBe(true);
  });

  it("builds a prompt that folds prior failure signals into the current turn", async () => {
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "main",
      task: "fix target file",
      validation,
      outcome: {
        status: "error",
        errorKind: "invalid_structured_result",
      },
    });

    const prompt = await buildOmegaInteractionPrompt({
      workspaceRoot,
      sessionKey: "main",
      task: "that still failed, fix target file again and return valid json",
      validation,
    });

    expect(prompt).toContain("[OMEGA Input Interpretation]");
    expect(prompt).toContain("Interaction kind: corrective_feedback");
    expect(prompt).toContain("Recent verified failure signals: invalid_structured_result");
    expect(prompt).toContain("[OMEGA Outcome Model]");
    expect(prompt).toContain("Do not defend the old answer");
  });
});
