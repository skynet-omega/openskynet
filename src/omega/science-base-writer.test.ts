import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendScienceBaseRule } from "./science-base-writer.js";

describe("science base writer", () => {
  let workspaceRoot = "";

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openskynet-science-base-"));
  });

  afterEach(async () => {
    if (workspaceRoot) {
      await fs.rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("creates SCIENCE_BASE with header and appends a verified rule", async () => {
    await appendScienceBaseRule({
      workspaceRoot,
      task: "repair continuity drift",
      observedChangedFiles: ["src/omega/session-context.ts"],
      sessionKey: "agent:main:main",
    });

    const content = await fs.readFile(path.join(workspaceRoot, "SCIENCE_BASE.md"), "utf-8");
    expect(content).toContain("# SCIENCE_BASE");
    expect(content).toContain("repair continuity drift");
    expect(content).toContain("src/omega/session-context.ts");
  });

  it("deduplicates exact task/file combinations", async () => {
    const params = {
      workspaceRoot,
      task: "repair continuity drift",
      observedChangedFiles: ["src/omega/session-context.ts"],
      sessionKey: "agent:main:main",
    };

    await appendScienceBaseRule(params);
    await appendScienceBaseRule(params);

    const content = await fs.readFile(path.join(workspaceRoot, "SCIENCE_BASE.md"), "utf-8");
    expect(content.match(/repair continuity drift/g)).toHaveLength(1);
  });
});
