import { describe, expect, it } from "vitest";
import "./test-helpers/fast-core-tools.js";
import { createOpenClawToolSuites, createOpenClawTools } from "./openclaw-tools.js";

describe("openclaw tool suites", () => {
  it("groups omega tools as runtime without changing the flattened public surface", () => {
    const suites = createOpenClawToolSuites({
      agentSessionKey: "main",
      workspaceDir: process.cwd(),
      config: { session: {}, tools: {} } as never,
    });
    const omegaSuite = suites.find((suite) => suite.kind === "omega");
    const sessionSuite = suites.find((suite) => suite.kind === "session");
    expect(omegaSuite).toBeDefined();
    expect(sessionSuite).toBeDefined();
    expect(omegaSuite?.entries.map((entry) => entry.tool.name)).toEqual([
      "omega_work",
      "omega_delegate",
    ]);
    expect(sessionSuite?.entries.map((entry) => entry.tool.name)).toContain("sessions_send");
    expect(new Set(omegaSuite?.entries.map((entry) => entry.classification))).toEqual(
      new Set(["runtime"]),
    );

    const flattened = createOpenClawTools({
      agentSessionKey: "main",
      workspaceDir: process.cwd(),
      config: { session: {}, tools: {} } as never,
    }).map((tool) => tool.name);
    expect(flattened).toContain("omega_work");
    expect(flattened).toContain("sessions_send");
    expect(flattened).toContain("sessions_spawn");
  });
});
