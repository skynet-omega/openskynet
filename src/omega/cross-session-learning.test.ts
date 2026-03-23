import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, vi } from "vitest";
import { loadOmegaDurableMemory } from "./durable-memory.js";
import { recordOmegaSessionOutcome, loadOmegaSessionRuntimeSnapshot } from "./session-context.js";
import { loadOmegaWorldModelSnapshot } from "./world-model.js";

async function createWorkspaceRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "omega-cross-session-test-"));
  return root;
}

describe("Omega Cross-Session Learning (Durable Bridge)", () => {
  it("transfers learned constraints from Session A to Session B via Durable Memory", async () => {
    const workspaceRoot = await createWorkspaceRoot();
    const task = "patch critical module with sudo";
    const expectedPaths = ["src/protected.ts"];

    // --- SESSION A: Fails and learns ---
    const sessionA = "session-a";
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: sessionA,
      task,
      validation: { expectsJson: false, expectedKeys: [], expectedPaths },
      outcome: { status: "error", errorKind: "target_not_touched" }, // This triggers "touch_required_targets" constraint
    });

    // Verify Session A saved it to Durable Memory
    const durable = await loadOmegaDurableMemory({ workspaceRoot, sessionKey: sessionA });
    const relevantEntry = durable.find((e) => e.task === task);
    expect(relevantEntry).toBeDefined();
    // It should have inherited "touch_required_targets" from the errorKind mapping in event-model.ts
    expect(relevantEntry?.learnedConstraints).toContain("touch_required_targets");

    // --- SESSION B: Starts fresh but inherits ---
    const sessionB = "session-b";
    const snapshotB = await loadOmegaWorldModelSnapshot({
      workspaceRoot,
      sessionKey: sessionB,
      task, // Same task
      expectedPaths,
    });

    // CRITICAL TEST: Session B should have the constraint in its snapshot despite being a new session
    console.log("Session B Learned Constraints:", snapshotB.selfState?.learnedConstraints);
    expect(snapshotB.selfState?.learnedConstraints).toContain("touch_required_targets");

    // Cleanup
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });
});
