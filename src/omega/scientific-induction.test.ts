import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { induceScientificHypothesis } from "./scientific-induction.js";
import { recordOmegaSessionOutcome } from "./session-context.js";
import { loadOmegaWorldModelSnapshot } from "./world-model.js";

async function createWorkspaceRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "omega-induction-test-"));
  return root;
}

describe("Scientific Induction Engine", () => {
  it("induces a context-aware hypothesis from specific durable failures", async () => {
    const workspaceRoot = await createWorkspaceRoot();
    const sessionKey = "induction-test";
    const task = "update documentation headers";
    const targets = ["docs/header.md"];

    // 1. Simulate a specific failure
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey,
      task,
      validation: { expectsJson: false, expectedKeys: [], expectedPaths: targets },
      outcome: { status: "error", errorKind: "target_not_touched" },
    });

    // 2. Load World Model (which now includes the problem agenda and relevant memories)
    const snapshot = await loadOmegaWorldModelSnapshot({
      workspaceRoot,
      sessionKey,
      task: "any", // To trigger agenda sync
    });

    const classKey = "failure:target_not_touched";
    const agendaItem = snapshot.problemAgenda.find((i) => i.classKey === classKey);
    expect(agendaItem).toBeDefined();

    // 3. RUN INDUCTION
    const contract = await induceScientificHypothesis({
      classKey,
      snapshot,
    });

    // 4. VERIFY RESULTS (Induced vs Static)
    console.log("Induced Hypothesis:", contract.hypothesis);

    // The static baseline would be: "There is a reusable countermeasure for the failure class target_not_touched."
    // The induced hypothesis should be specific to the task and targets.
    expect(contract.hypothesis).toContain("target_not_touched");
    expect(contract.hypothesis).toContain(task);
    expect(contract.hypothesis).toContain(targets[0]);
    expect(contract.hypothesis).toContain("edge case"); // from our induction rules

    // Cleanup
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });
});
