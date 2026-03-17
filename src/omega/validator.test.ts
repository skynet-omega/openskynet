import { describe, expect, it } from "vitest";
import { validateObservedWrite, validateStructuredOmegaResult } from "./validator.js";

describe("omega validator", () => {
  it("accepts a structured payload when the required keys are present", () => {
    const result = validateStructuredOmegaResult(
      {
        task: "return a JSON payload",
        expectsJson: true,
        expectedKeys: ["status", "summary"],
      },
      'analysis...\n{"status":"ok","summary":"done"}',
    );

    expect(result).toMatchObject({
      ok: true,
      expectedKeys: ["status", "summary"],
    });
  });

  it("rejects a structured payload when required keys are missing", () => {
    const result = validateStructuredOmegaResult(
      {
        task: "return a JSON payload",
        expectsJson: true,
        expectedKeys: ["status", "summary"],
      },
      '{"status":"ok"}',
    );

    expect(result).toMatchObject({
      ok: false,
      errorKind: "invalid_structured_result",
      expectedKeys: ["status", "summary"],
    });
  });

  it("accepts writes when an expected target path was really touched", () => {
    const result = validateObservedWrite({
      expectedPaths: ["workspace/manual_code_probe/range_tools.py"],
      observedChangedFiles: ["/tmp/run/workspace/manual_code_probe/range_tools.py"],
    });

    expect(result).toMatchObject({
      ok: true,
      expectedPaths: ["workspace/manual_code_probe/range_tools.py"],
    });
  });

  it("rejects reports that claim code edits without a disk delta on the target", () => {
    const result = validateObservedWrite({
      expectedPaths: ["workspace/manual_code_probe/range_tools.py"],
      observedChangedFiles: ["workspace/manual_code_probe/other_file.py"],
    });

    expect(result).toMatchObject({
      ok: false,
      errorKind: "target_not_touched",
      observedChangedFiles: ["workspace/manual_code_probe/other_file.py"],
    });
  });

  it("rejects multi-file claims when only part of the required target set changed", () => {
    const result = validateObservedWrite({
      expectedPaths: [
        "workspace/manual_code_probe/range_tools.py",
        "workspace/manual_code_probe/test_range_tools.py",
      ],
      observedChangedFiles: ["/tmp/run/workspace/manual_code_probe/range_tools.py"],
    });

    expect(result).toMatchObject({
      ok: false,
      errorKind: "missing_target_writes",
      expectedPaths: [
        "workspace/manual_code_probe/range_tools.py",
        "workspace/manual_code_probe/test_range_tools.py",
      ],
      observedChangedFiles: ["/tmp/run/workspace/manual_code_probe/range_tools.py"],
      missingExpectedPaths: ["workspace/manual_code_probe/test_range_tools.py"],
    });
  });
});
