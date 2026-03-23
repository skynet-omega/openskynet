import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { queryOmegaDurableMemory, resolveOmegaDurableMemoryFile } from "./durable-memory.js";
import { recordOmegaSessionOutcome } from "./session-context.js";

describe("omega durable memory", () => {
  let workspaceRoot = "";
  const sessionKey = "agent:tester:main";

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "omega-durable-memory-"));
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it("admits only verified successes and repeated failures", async () => {
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey,
      task: "Inspect flaky auth retry path",
      validation: { expectsJson: false, expectedKeys: [], expectedPaths: ["src/auth.ts"] },
      outcome: { status: "error", errorKind: "target_not_touched" },
    });

    const afterFirstFailure = await queryOmegaDurableMemory({
      workspaceRoot,
      sessionKey,
      task: "auth retry",
      expectedPaths: ["src/auth.ts"],
    });
    expect(afterFirstFailure).toHaveLength(0);

    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey,
      task: "Inspect flaky auth retry path",
      validation: { expectsJson: false, expectedKeys: [], expectedPaths: ["src/auth.ts"] },
      outcome: { status: "error", errorKind: "target_not_touched" },
    });

    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey,
      task: "Fix auth retry path",
      validation: { expectsJson: false, expectedKeys: [], expectedPaths: ["src/auth.ts"] },
      outcome: {
        status: "ok",
        observedChangedFiles: ["src/auth.ts"],
        writeOk: true,
      },
    });

    const recalled = await queryOmegaDurableMemory({
      workspaceRoot,
      sessionKey,
      task: "fix auth retry bug",
      expectedPaths: ["src/auth.ts"],
    });

    expect(recalled.map((entry) => entry.kind)).toEqual(
      expect.arrayContaining(["verified_success", "repeated_failure"]),
    );
    const repeatedFailure = recalled.find((entry) => entry.kind === "repeated_failure");
    const verifiedSuccess = recalled.find((entry) => entry.kind === "verified_success");
    expect(verifiedSuccess?.targets).toContain("src/auth.ts");
    expect(repeatedFailure?.failureCount).toBe(2);
  });

  it("persists durable memory on disk", async () => {
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey,
      task: "Update session continuity cache",
      validation: { expectsJson: true, expectedKeys: ["ok"], expectedPaths: [] },
      outcome: { status: "ok", structuredOk: true },
    });

    const file = resolveOmegaDurableMemoryFile({ workspaceRoot, sessionKey });
    const raw = await fs.readFile(file, "utf-8");
    expect(raw).toContain("Update session continuity cache");
    expect(raw).toContain("verified_success");
  });

  it("persists locality telemetry for later routing decisions", async () => {
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey,
      task: "Patch isolated config path",
      validation: { expectsJson: false, expectedKeys: [], expectedPaths: ["src/config.ts"] },
      outcome: {
        status: "ok",
        observedChangedFiles: ["src/config.ts"],
        writeOk: true,
        localityScore: 1,
        protectedPreservationRate: 1,
      },
    });

    const recalled = await queryOmegaDurableMemory({
      workspaceRoot,
      sessionKey,
      task: "patch config",
      expectedPaths: ["src/config.ts"],
    });

    expect(recalled[0]).toMatchObject({
      localityScore: 1,
      protectedPreservationRate: 1,
    });
  });
});
