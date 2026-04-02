import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadOmegaDecisionContext } from "./decision-context.js";
import * as executionController from "./execution-controller.js";
import * as wspModule from "./omega-wsp.js";
import * as operationalMemory from "./operational-memory.js";
import { recordOmegaSessionOutcome } from "./session-context.js";
import * as sessionContext from "./session-context.js";

const tempDirs: string[] = [];

async function createWorkspaceRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "openskynet-omega-decision-context-"));
  tempDirs.push(root);
  return root;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    tempDirs.splice(0, tempDirs.length).map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
});

describe("omega decision context", () => {
  it("reuses the executive session authority instead of reloading session state separately", async () => {
    const workspaceRoot = await createWorkspaceRoot();
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "agent:test:main",
      task: "repair src/app.ts",
      validation: {
        expectsJson: false,
        expectedKeys: [],
        expectedPaths: ["src/app.ts"],
      },
      outcome: {
        status: "ok",
        observedChangedFiles: ["src/app.ts"],
        writeOk: true,
      },
    });

    const sessionSpy = vi.spyOn(sessionContext, "loadOmegaSessionAuthority");
    const context = await loadOmegaDecisionContext({
      workspaceRoot,
      sessionKey: "agent:test:main",
      includeWorldSnapshot: true,
    });

    expect(sessionSpy).toHaveBeenCalledTimes(1);
    expect(context.timeline).toHaveLength(1);
    expect(context.kernel?.sessionKey).toBe("agent:test:main");
    expect(context.controllerState?.executiveState.sourceSessionAuthority?.timeline).toHaveLength(
      1,
    );
    expect(context.degradedComponents).toEqual([]);
  });

  it("surfaces degraded decision-context components instead of silently flattening them", async () => {
    const workspaceRoot = await createWorkspaceRoot();

    vi.spyOn(executionController, "syncOmegaExecutionControllerState").mockRejectedValueOnce(
      new Error("controller exploded"),
    );
    vi.spyOn(operationalMemory, "loadOmegaOperationalMemoryTail").mockRejectedValueOnce(
      new Error("operational tail missing"),
    );
    vi.spyOn(wspModule, "loadOmegaWSP").mockRejectedValueOnce(new Error("wsp unavailable"));

    const context = await loadOmegaDecisionContext({
      workspaceRoot,
      sessionKey: "agent:test:degraded",
      includeWorldSnapshot: true,
    });

    expect(context.controllerState).toBeUndefined();
    expect(context.wsp).toBeUndefined();
    expect(context.timeline).toEqual([]);
    expect(context.degradedComponents).toEqual([
      { component: "controller_state", reason: "controller exploded" },
      { component: "operational_memory_tail", reason: "operational tail missing" },
      { component: "omega_wsp", reason: "wsp unavailable" },
    ]);
  });
});
