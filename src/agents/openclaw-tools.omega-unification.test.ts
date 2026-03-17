import { describe, expect, it } from "vitest";
import "./test-helpers/fast-core-tools.js";
import { createOpenClawTools } from "./openclaw-tools.js";

describe("omega migration unification", () => {
  function schemaKeysFor(toolName: string): string[] {
    const tool = createOpenClawTools({
      agentSessionKey: "main",
      workspaceDir: process.cwd(),
      config: { session: {}, tools: {} } as never,
    }).find((candidate) => candidate.name === toolName);
    expect(tool).toBeDefined();
    if (!tool) {
      throw new Error(`missing tool: ${toolName}`);
    }
    return Object.keys((tool.parameters as { properties?: Record<string, unknown> }).properties ?? {});
  }

  it("exposes the migrated omega tools inside the host", () => {
    const names = createOpenClawTools({
      agentSessionKey: "main",
      workspaceDir: process.cwd(),
      config: { session: {}, tools: {} } as never,
    }).map((tool) => tool.name);

    expect(names).toContain("sessions_send");
    expect(names).toContain("sessions_spawn");
    expect(names).toContain("omega_delegate");
    expect(names).toContain("omega_work");
  });

  it("keeps validation parameters aligned across migrated surfaces", () => {
    const expected = ["expectedKeys", "expectedPaths", "expectsJson"];
    const sendKeys = schemaKeysFor("sessions_send");
    const spawnKeys = schemaKeysFor("sessions_spawn");
    const delegateKeys = schemaKeysFor("omega_delegate");

    expect(sendKeys.filter((key) => expected.includes(key)).sort()).toEqual(expected);
    expect(spawnKeys.filter((key) => expected.includes(key)).sort()).toEqual(expected);
    expect(delegateKeys.filter((key) => expected.includes(key)).sort()).toEqual(expected);
  });
});
