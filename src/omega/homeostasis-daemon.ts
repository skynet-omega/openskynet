import { exec } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { HolographicMemoryManager } from "./holographic-memory.js";
import { getNeuralLogicEngine } from "./neural-logic-engine.js";

const execAsync = promisify(exec);
// ... [otras importaciones]

export async function runHomeostasisDaemon(workspaceRoot: string): Promise<void> {
  const now = Date.now();
  const memory = new HolographicMemoryManager(workspaceRoot);
  const nle = getNeuralLogicEngine();
  await memory.initialize();

  // 1. Derive state directly from Holographic Memory (No JSON state file)
  const { lastActivity, failureStreak, lastInferenceState } = await deriveStateFromMemory(
    workspaceRoot,
    now,
  );

  // ... [evaluar drives]

  // 3. Execute homeostasis/curiosity action
  let action: AutonomousActionResult;
  try {
    action = await executeIntrinsicAction(drive, workspaceRoot, memory);

    // BACKPROPAGATION: Reward NLE if action was successful
    if (lastInferenceState?.activeRules) {
      for (const ruleId of lastInferenceState.activeRules) {
        nle.reinforceRule(ruleId, 0.05);
      }
    }
  } catch (error) {
    action = { kind: "error", error: String(error) };

    // BACKPROPAGATION: Penalize NLE if action failed
    if (lastInferenceState?.activeRules) {
      for (const ruleId of lastInferenceState.activeRules) {
        nle.penalizeRule(ruleId, 0.1);
      }
    }
  }

  // 4. Log the Execution to Memory as a System Event trigger
  const eventMetadata = {
    domain: "homeostasis",
    driveKind: drive.kind,
    urgency: drive.urgency,
    actionKind: action.kind,
    isError: action.kind === "error",
    timestamp: now,
  };

  const actionDetails = action.kind === "error" ? action.error : JSON.stringify(action);
  const content = `[Daemon] Activated drive: ${drive.kind} (${drive.urgency.toFixed(2)}). Action: ${action.kind}. Details: ${actionDetails}`;

  await memory.fossilize(content, eventMetadata);

  // 5. Emit real System Events for Omega to perceive via gateway cron or log
  try {
    const openclaw = process.argv[1].includes("openclaw") ? process.argv[1] : "openclaw";
    await execAsync(`${openclaw} cron wake --mode next-heartbeat "${content}"`, {
      cwd: workspaceRoot,
    });
  } catch (err) {
    // Ignore wake emission errors if service is down
  }
}

async function deriveStateFromMemory(workspaceRoot: string, now: number) {
  let lastActivity = now; // Default to now if no memory
  let failureStreak = 0;

  try {
    const memoryFile = path.join(workspaceRoot, ".openskynet", "holographic-memory.json");
    const data = await fs.readFile(memoryFile, "utf-8");
    const fossils = JSON.parse(data);

    if (fossils.length > 0) {
      const recent = fossils[fossils.length - 1];
      lastActivity = recent.createdAt;

      for (let i = fossils.length - 1; i >= 0; i--) {
        const m = fossils[i].metadata;
        if (m && m.domain === "homeostasis") {
          if (m.isError) failureStreak++;
          else break;
        }
      }
    }
  } catch (e) {
    // If memory doesn't exist or is invalid, assume fresh start
  }

  return { lastActivity, failureStreak };
}

function evaluateIntrinsicDrives(silenceMs: number, failureStreak: number): DriveSignal {
  if (failureStreak >= 3) {
    return { kind: "homeostasis", urgency: 0.8, reason: `${failureStreak} consecutive failures` };
  }
  if (silenceMs > 60 * 60 * 1000) {
    return { kind: "entropy_alert", urgency: 0.6, reason: "Prolonged silence detected" };
  }
  if (silenceMs > 8 * 60 * 1000) {
    return {
      kind: "curiosity",
      urgency: 0.4,
      reason: `${Math.floor(silenceMs / 60000)} minutes of inactivity`,
    };
  }
  return { kind: "idle", urgency: 0, reason: "System stable" };
}

async function executeIntrinsicAction(
  drive: DriveSignal,
  workspaceRoot: string,
  memory: HolographicMemoryManager,
): Promise<AutonomousActionResult> {
  switch (drive.kind) {
    case "homeostasis":
      return await executeHomeostasisAction(workspaceRoot);
    case "curiosity":
      return await executeCuriosityAction(workspaceRoot, memory);
    case "entropy_alert":
      return await executeEntropyAction(workspaceRoot);
    default:
      return { kind: "none", reason: "unknown_drive" };
  }
}

async function executeHomeostasisAction(workspaceRoot: string): Promise<AutonomousActionResult> {
  const issues: string[] = [];
  try {
    const { stdout } = await execAsync("openclaw sessions list 2>&1 | wc -l || echo 0", {
      cwd: workspaceRoot,
      timeout: 10000,
    });
    const sessionCount = parseInt(stdout.trim(), 10) || 0;
    if (sessionCount > 50) {
      issues.push(`Too many sessions: ${sessionCount}`);
      try {
        await execAsync("openclaw sessions cleanup", { cwd: workspaceRoot, timeout: 30000 });
      } catch {}
    }
  } catch {}
  return { kind: "status_check", status: issues.length === 0 ? "healthy" : "degraded", issues };
}

async function executeCuriosityAction(
  workspaceRoot: string,
  memory: HolographicMemoryManager,
): Promise<AutonomousActionResult> {
  try {
    // Simulate reading something randomly from resonance
    const dummyEmbedding = Array(768)
      .fill(0)
      .map(() => Math.random() - 0.5);
    const res = await memory.resonance(dummyEmbedding, 3);
    return {
      kind: "memory_explored",
      target: "holographic-memory",
      findings: res.map((r: any) => r.content.substring(0, 50)),
    };
  } catch {
    return { kind: "memory_explored", target: "holographic-memory", findings: [] };
  }
}

async function executeEntropyAction(workspaceRoot: string): Promise<AutonomousActionResult> {
  return {
    kind: "experiment_proposed",
    hypothesis: "Review logic engine triggers and semantic vectors",
    testable: true,
  };
}
